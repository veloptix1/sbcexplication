import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Customer, Order, OrderStatus, PaymentStatus } from "../core/app-model.js";
import type { PageLike } from "../core/schema.js";

/** Stockage des boutiques publiées, des clients et des commandes. */

export interface ShopRecord {
  slug: string;
  /** Empreinte SHA-256 de la clé d'administration. */
  ownerHash: string;
  /** Version publiée (contient les jetons Telegram : ne jamais l'envoyer telle quelle au public). */
  project: PageLike;
  orderSeq: number;
  /** Compteur de modifications, pour l'écriture optimiste. */
  rev: number;
  createdAt: number;
  updatedAt: number;
}

export interface CustomerRecord extends Customer {
  passHash: string;
}

export type PlaceOutcome = { ok: false; error: string; status: 400 | 404 | 409 } | { ok: true; order: Order; project: PageLike };
/** Reçoit la boutique à jour et le prochain numéro ; renvoie la commande et le catalogue avec stocks décrémentés. */
export type OrderBuilder = (shop: ShopRecord, number: number) => PlaceOutcome;

export interface Store {
  readonly kind: "memory" | "file" | "supabase";
  readonly persistent: boolean;
  getShop(slug: string): Promise<ShopRecord | null>;
  /** false si le nom est déjà pris. */
  createShop(shop: Omit<ShopRecord, "rev" | "orderSeq">): Promise<boolean>;
  /** Remplace le projet publié (les stocks courants sont conservés par la route). */
  updateProject(slug: string, project: PageLike): Promise<void>;
  /** Modifie le projet de façon atomique (restockage, activation d'un produit…). */
  mutateProject(slug: string, fn: (p: PageLike) => PageLike): Promise<PageLike | null>;
  placeOrder(slug: string, build: OrderBuilder): Promise<PlaceOutcome>;
  createCustomer(slug: string, c: CustomerRecord): Promise<boolean>;
  getCustomerByPhone(slug: string, phone: string): Promise<CustomerRecord | null>;
  getCustomer(slug: string, id: string): Promise<CustomerRecord | null>;
  listCustomers(slug: string, limit: number): Promise<Customer[]>;
  listOrders(slug: string, opts: { customerId?: string; limit: number }): Promise<Order[]>;
  getOrder(slug: string, id: string): Promise<Order | null>;
  updateOrder(slug: string, id: string, patch: { status?: OrderStatus; paymentStatus?: PaymentStatus }): Promise<Order | null>;
}

const publicCustomer = ({ passHash: _h, ...c }: CustomerRecord): Customer => c;

/* ------------------------------------------------------------------ */
/* Mémoire (tests, développement) + fichier JSON (serveur Node / VPS)  */
/* ------------------------------------------------------------------ */

interface Data {
  shops: Record<string, ShopRecord>;
  customers: Record<string, CustomerRecord[]>;
  orders: Record<string, Order[]>;
}

export class MemoryStore implements Store {
  readonly kind: "memory" | "file" = "memory";
  readonly persistent: boolean = false;
  protected data: Data = { shops: {}, customers: {}, orders: {} };
  /** Sérialise les écritures : un seul « commande » à la fois, donc pas de survente. */
  private chain: Promise<unknown> = Promise.resolve();

  protected async persist(): Promise<void> {}

  private exclusive<T>(fn: () => Promise<T> | T): Promise<T> {
    const run = this.chain.then(async () => {
      const result = await fn();
      await this.persist();
      return result;
    });
    this.chain = run.catch(() => undefined);
    return run;
  }

  async getShop(slug: string): Promise<ShopRecord | null> {
    await this.chain;
    return this.data.shops[slug] ?? null;
  }

  createShop(shop: Omit<ShopRecord, "rev" | "orderSeq">): Promise<boolean> {
    return this.exclusive(() => {
      if (this.data.shops[shop.slug]) return false;
      this.data.shops[shop.slug] = { ...shop, rev: 1, orderSeq: 0 };
      return true;
    });
  }

  updateProject(slug: string, project: PageLike): Promise<void> {
    return this.exclusive(() => {
      const s = this.data.shops[slug];
      if (s) this.data.shops[slug] = { ...s, project, rev: s.rev + 1, updatedAt: Date.now() };
    });
  }

  mutateProject(slug: string, fn: (p: PageLike) => PageLike): Promise<PageLike | null> {
    return this.exclusive(() => {
      const s = this.data.shops[slug];
      if (!s) return null;
      const project = fn(s.project);
      this.data.shops[slug] = { ...s, project, rev: s.rev + 1, updatedAt: Date.now() };
      return project;
    });
  }

  placeOrder(slug: string, build: OrderBuilder): Promise<PlaceOutcome> {
    return this.exclusive((): PlaceOutcome => {
      const s = this.data.shops[slug];
      if (!s) return { ok: false, error: "Boutique introuvable.", status: 404 };
      const out = build(s, s.orderSeq + 1);
      if (!out.ok) return out;
      this.data.shops[slug] = { ...s, project: out.project, orderSeq: s.orderSeq + 1, rev: s.rev + 1, updatedAt: Date.now() };
      (this.data.orders[slug] ??= []).push(out.order);
      return out;
    });
  }

  createCustomer(slug: string, c: CustomerRecord): Promise<boolean> {
    return this.exclusive(() => {
      const list = (this.data.customers[slug] ??= []);
      if (list.some((x) => x.phone === c.phone)) return false;
      list.push(c);
      return true;
    });
  }

  async getCustomerByPhone(slug: string, phone: string): Promise<CustomerRecord | null> {
    await this.chain;
    return this.data.customers[slug]?.find((c) => c.phone === phone) ?? null;
  }

  async getCustomer(slug: string, id: string): Promise<CustomerRecord | null> {
    await this.chain;
    return this.data.customers[slug]?.find((c) => c.id === id) ?? null;
  }

  async listCustomers(slug: string, limit: number): Promise<Customer[]> {
    await this.chain;
    return [...(this.data.customers[slug] ?? [])].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit).map(publicCustomer);
  }

  async listOrders(slug: string, opts: { customerId?: string; limit: number }): Promise<Order[]> {
    await this.chain;
    const all = this.data.orders[slug] ?? [];
    return all.filter((o) => !opts.customerId || o.customerId === opts.customerId).sort((a, b) => b.number - a.number).slice(0, opts.limit);
  }

  async getOrder(slug: string, id: string): Promise<Order | null> {
    await this.chain;
    return this.data.orders[slug]?.find((o) => o.id === id) ?? null;
  }

  updateOrder(slug: string, id: string, patch: { status?: OrderStatus; paymentStatus?: PaymentStatus }): Promise<Order | null> {
    return this.exclusive(() => {
      const list = this.data.orders[slug];
      const i = list?.findIndex((o) => o.id === id) ?? -1;
      if (!list || i < 0) return null;
      const next = { ...list[i]!, ...(patch.status ? { status: patch.status } : {}), ...(patch.paymentStatus ? { paymentStatus: patch.paymentStatus } : {}) };
      list[i] = next;
      return next;
    });
  }
}

/** Même comportement que la mémoire, enregistré dans un fichier JSON (écriture atomique). */
export class FileStore extends MemoryStore {
  override readonly kind = "file" as unknown as "memory";
  override readonly persistent = true;
  private ready: Promise<void>;

  constructor(private readonly path: string) {
    super();
    this.ready = readFile(path, "utf8").then(
      (text) => {
        const parsed = JSON.parse(text) as Partial<Data>;
        this.data = { shops: parsed.shops ?? {}, customers: parsed.customers ?? {}, orders: parsed.orders ?? {} };
      },
      (e: NodeJS.ErrnoException) => {
        if (e.code !== "ENOENT") throw e;
      },
    );
  }

  override async getShop(slug: string): Promise<ShopRecord | null> {
    await this.ready;
    return super.getShop(slug);
  }

  protected override async persist(): Promise<void> {
    await this.ready;
    await mkdir(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    await writeFile(tmp, JSON.stringify(this.data), "utf8");
    await rename(tmp, this.path);
  }
}

/* ------------------------------------------------------------------ */
/* Supabase (PostgREST), pour Vercel et tout hébergement sans disque   */
/* ------------------------------------------------------------------ */

type Row = Record<string, unknown>;

export class SupabaseStore implements Store {
  readonly kind = "supabase" as const;
  readonly persistent = true;
  private readonly base: string;

  constructor(
    url: string,
    private readonly serviceKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.base = `${url.replace(/\/+$/, "")}/rest/v1`;
  }

  private async call(path: string, init: RequestInit & { prefer?: string } = {}): Promise<{ status: number; rows: Row[] }> {
    const { prefer, ...rest } = init;
    const res = await this.fetchImpl(`${this.base}/${path}`, {
      ...rest,
      headers: {
        apikey: this.serviceKey,
        authorization: `Bearer ${this.serviceKey}`,
        "content-type": "application/json",
        ...(prefer ? { prefer } : {}),
      },
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    if (!res.ok && res.status !== 409) throw new Error(`Supabase ${res.status}: ${text.slice(0, 200)}`);
    let rows: Row[] = [];
    if (text) {
      try {
        const parsed: unknown = JSON.parse(text);
        rows = Array.isArray(parsed) ? (parsed as Row[]) : [];
      } catch {
        rows = [];
      }
    }
    return { status: res.status, rows };
  }

  private toShop(r: Row): ShopRecord {
    return {
      slug: String(r.slug),
      ownerHash: String(r.owner_hash),
      project: r.project as PageLike,
      orderSeq: Number(r.order_seq),
      rev: Number(r.rev),
      createdAt: Number(r.created_at),
      updatedAt: Number(r.updated_at),
    };
  }

  private toOrder(r: Row): Order {
    return { ...(r.data as Order), id: String(r.id), number: Number(r.number), status: r.status as OrderStatus, paymentStatus: r.payment_status as PaymentStatus };
  }

  private q = (v: string): string => encodeURIComponent(v);

  async getShop(slug: string): Promise<ShopRecord | null> {
    const { rows } = await this.call(`shops?slug=eq.${this.q(slug)}&select=*`);
    return rows[0] ? this.toShop(rows[0]) : null;
  }

  async createShop(shop: Omit<ShopRecord, "rev" | "orderSeq">): Promise<boolean> {
    const { status } = await this.call("shops", {
      method: "POST",
      prefer: "return=minimal",
      body: JSON.stringify({ slug: shop.slug, owner_hash: shop.ownerHash, project: shop.project, order_seq: 0, rev: 1, created_at: shop.createdAt, updated_at: shop.updatedAt }),
    });
    return status !== 409;
  }

  /** PATCH conditionnel sur rev : renvoie false si quelqu'un a modifié la boutique entre-temps. */
  private async patchShop(slug: string, rev: number, fields: Row): Promise<boolean> {
    const { rows } = await this.call(`shops?slug=eq.${this.q(slug)}&rev=eq.${rev}`, {
      method: "PATCH",
      prefer: "return=representation",
      body: JSON.stringify({ ...fields, rev: rev + 1, updated_at: Date.now() }),
    });
    return rows.length > 0;
  }

  async updateProject(slug: string, project: PageLike): Promise<void> {
    await this.mutateProject(slug, () => project);
  }

  async mutateProject(slug: string, fn: (p: PageLike) => PageLike): Promise<PageLike | null> {
    for (let i = 0; i < 6; i++) {
      const shop = await this.getShop(slug);
      if (!shop) return null;
      const project = fn(shop.project);
      if (await this.patchShop(slug, shop.rev, { project })) return project;
    }
    throw new Error("Boutique trop sollicitée, réessaie.");
  }

  async placeOrder(slug: string, build: OrderBuilder): Promise<PlaceOutcome> {
    for (let i = 0; i < 6; i++) {
      const shop = await this.getShop(slug);
      if (!shop) return { ok: false, error: "Boutique introuvable.", status: 404 };
      const number = shop.orderSeq + 1;
      const out = build(shop, number);
      if (!out.ok) return out;
      // 1) on réserve le numéro en insérant la commande (clé unique slug+number), 2) on décrémente les stocks si personne n'a bougé.
      const ins = await this.call("orders", {
        method: "POST",
        prefer: "return=minimal",
        body: JSON.stringify({ id: out.order.id, slug, number, customer_id: out.order.customerId, status: out.order.status, payment_status: out.order.paymentStatus, created_at: out.order.createdAt, data: out.order }),
      });
      if (ins.status === 409) continue;
      if (await this.patchShop(slug, shop.rev, { project: out.project, order_seq: number })) return out;
      await this.call(`orders?id=eq.${this.q(out.order.id)}`, { method: "DELETE", prefer: "return=minimal" });
    }
    return { ok: false, error: "La boutique reçoit beaucoup de commandes en même temps, réessaie.", status: 409 };
  }

  async createCustomer(slug: string, c: CustomerRecord): Promise<boolean> {
    const { status } = await this.call("customers", {
      method: "POST",
      prefer: "return=minimal",
      body: JSON.stringify({ id: c.id, slug, name: c.name, phone: c.phone, pass_hash: c.passHash, created_at: c.createdAt }),
    });
    return status !== 409;
  }

  private toCustomer(r: Row): CustomerRecord {
    return { id: String(r.id), name: String(r.name), phone: String(r.phone), passHash: String(r.pass_hash), createdAt: Number(r.created_at) };
  }

  async getCustomerByPhone(slug: string, phone: string): Promise<CustomerRecord | null> {
    const { rows } = await this.call(`customers?slug=eq.${this.q(slug)}&phone=eq.${this.q(phone)}&select=*`);
    return rows[0] ? this.toCustomer(rows[0]) : null;
  }

  async getCustomer(slug: string, id: string): Promise<CustomerRecord | null> {
    const { rows } = await this.call(`customers?slug=eq.${this.q(slug)}&id=eq.${this.q(id)}&select=*`);
    return rows[0] ? this.toCustomer(rows[0]) : null;
  }

  async listCustomers(slug: string, limit: number): Promise<Customer[]> {
    const { rows } = await this.call(`customers?slug=eq.${this.q(slug)}&select=*&order=created_at.desc&limit=${limit}`);
    return rows.map((r) => {
      const { passHash: _h, ...c } = this.toCustomer(r);
      return c;
    });
  }

  async listOrders(slug: string, opts: { customerId?: string; limit: number }): Promise<Order[]> {
    const who = opts.customerId ? `&customer_id=eq.${this.q(opts.customerId)}` : "";
    const { rows } = await this.call(`orders?slug=eq.${this.q(slug)}${who}&select=*&order=number.desc&limit=${opts.limit}`);
    return rows.map((r) => this.toOrder(r));
  }

  async getOrder(slug: string, id: string): Promise<Order | null> {
    const { rows } = await this.call(`orders?slug=eq.${this.q(slug)}&id=eq.${this.q(id)}&select=*`);
    return rows[0] ? this.toOrder(rows[0]) : null;
  }

  async updateOrder(slug: string, id: string, patch: { status?: OrderStatus; paymentStatus?: PaymentStatus }): Promise<Order | null> {
    const current = await this.getOrder(slug, id);
    if (!current) return null;
    const next = { ...current, ...(patch.status ? { status: patch.status } : {}), ...(patch.paymentStatus ? { paymentStatus: patch.paymentStatus } : {}) };
    await this.call(`orders?slug=eq.${this.q(slug)}&id=eq.${this.q(id)}`, {
      method: "PATCH",
      prefer: "return=minimal",
      body: JSON.stringify({ status: next.status, payment_status: next.paymentStatus, data: next }),
    });
    return next;
  }
}
