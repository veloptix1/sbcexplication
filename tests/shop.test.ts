import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/server/app.js";
import { hashPassword, signToken, verifyPassword, verifyToken } from "../src/server/auth.js";
import { FileStore, MemoryStore, SupabaseStore } from "../src/server/store.js";
import { TEMPLATES } from "../src/core/templates.js";
import { computeTotals, fillPayUrl, normalizePhone } from "../src/core/app-model.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

class Persistent extends MemoryStore {
  override readonly persistent = true;
}

const shopProject = () => {
  const p = TEMPLATES.find((t) => t.id === "app-boutique")!.build();
  if (p.kind !== "app") throw new Error("kind");
  p.products[0]!.stock = 3;
  p.payments = { cod: true, momo: [{ operator: "Orange Money", number: "699000000", holder: "Awa" }], linkLabel: "Payer", linkUrl: "https://pay.example.com/p?amount={amount}&ref={order}" };
  p.notify = { telegramBotToken: "123:SECRET", telegramChatId: "42" };
  return p;
};

const J = (body: unknown, headers: Record<string, string> = {}) => ({ method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

async function setup(fetchImpl?: typeof fetch) {
  const app = await createApp({ SESSION_SECRET: "s3cret" }, { store: new Persistent(), ...(fetchImpl ? { fetchImpl } : {}) });
  const res = await app.request("/api/publish", J({ slug: "ma-boutique", project: shopProject() }));
  const pub = (await res.json()) as { adminKey: string; url: string };
  return { app, key: pub.adminKey, pub, status: res.status };
}

describe("auth", () => {
  it("hache et vérifie les mots de passe, signe et vérifie les jetons", async () => {
    const h = await hashPassword("secret1");
    expect(await verifyPassword("secret1", h)).toBe(true);
    expect(await verifyPassword("secret2", h)).toBe(false);
    expect(await verifyPassword("x", "n'importe quoi")).toBe(false);
    const t = await signToken("k", "boutique", "c1");
    expect(await verifyToken("k", t, "boutique")).toBe("c1");
    expect(await verifyToken("k", t, "autre")).toBeNull();
    expect(await verifyToken("autre", t, "boutique")).toBeNull();
    expect(await verifyToken("k", t + "x", "boutique")).toBeNull();
    expect(await verifyToken("k", t, "boutique", Date.now() + 31 * 86400_000)).toBeNull();
  });
});

describe("règles de commande", () => {
  it("normalise les téléphones et calcule les totaux", () => {
    expect(normalizePhone("+237 6 99 00 00 00")).toBe("237699000000");
    expect(normalizePhone("00237699000000")).toBe("237699000000");
    expect(normalizePhone("12")).toBe("");
    expect(computeTotals([{ price: 5000, qty: 2 }], { deliveryFee: 1000, freeDeliveryFrom: 20000 })).toEqual({ subtotal: 10000, deliveryFee: 1000, total: 11000 });
    expect(computeTotals([{ price: 12000, qty: 2 }], { deliveryFee: 1000, freeDeliveryFrom: 20000 }).deliveryFee).toBe(0);
    expect(fillPayUrl("https://x.io/?a={amount}&o={order}", { amount: 10, order: 3 })).toBe("https://x.io/?a=10&o=3");
    expect(fillPayUrl("http://x.io", { amount: 1, order: 1 })).toBeNull();
    expect(fillPayUrl("javascript:alert(1)", { amount: 1, order: 1 })).toBeNull();
  });
});

describe("publication", () => {
  it("refuse sans stockage persistant", async () => {
    const app = await createApp({}, {});
    const res = await app.request("/api/publish", J({ slug: "x1", project: shopProject() }));
    expect(res.status).toBe(503);
  });

  it("publie, renvoie la clé une seule fois et refuse une adresse prise ou réservée", async () => {
    const { app, key, pub, status } = await setup();
    expect(status).toBe(200);
    expect(key).toMatch(/^af_/);
    expect(pub.url).toBe("/a/ma-boutique");
    const again = await app.request("/api/publish", J({ slug: "ma-boutique", project: shopProject() }));
    expect(again.status).toBe(409);
    const wrong = await app.request("/api/publish", J({ slug: "ma-boutique", project: shopProject(), key: "faux" }));
    expect(wrong.status).toBe(401);
    const ok = await app.request("/api/publish", J({ slug: "ma-boutique", project: shopProject(), key }));
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { created: boolean }).created).toBe(false);
    expect((await app.request("/api/publish", J({ slug: "api", project: shopProject() }))).status).toBe(400);
    expect((await app.request("/api/publish", J({ slug: "Bad Slug!", project: shopProject() }))).status).toBe(400);
  });

  it("ne publie pas un bot", async () => {
    const app = await createApp({}, { store: new Persistent() });
    const bot = TEMPLATES.find((t) => t.kind === "bot")!.build();
    expect((await app.request("/api/publish", J({ slug: "mon-bot", project: bot }))).status).toBe(400);
  });

  it("sert une page publiée avec une CSP et ne divulgue jamais le jeton Telegram", async () => {
    const { app } = await setup();
    const site = TEMPLATES.find((t) => t.kind === "site")!.build();
    const r = await app.request("/api/publish", J({ slug: "mon-site", project: site }));
    expect(r.status).toBe(200);
    const page = await app.request("/s/mon-site");
    expect(page.status).toBe(200);
    expect(page.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect((await page.text()).toLowerCase()).toContain("<!doctype html>");
    expect((await app.request("/s/ma-boutique", { redirect: "manual" })).status).toBe(302);
    const view = await (await app.request("/api/shops/ma-boutique")).text();
    expect(view).not.toContain("SECRET");
    expect(view).not.toContain("telegramBotToken");
    expect((await app.request("/api/shops/inconnu")).status).toBe(404);
  });
});

describe("clients et commandes", () => {
  it("inscription, connexion, commande avec prix serveur, stock et notification Telegram", async () => {
    const sent: { url: string; body: string }[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      sent.push({ url: String(url), body: String(init?.body) });
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    const { app } = await setup(fetchImpl);

    const reg = await app.request("/api/shops/ma-boutique/register", J({ name: "Awa K", phone: "+237 699 11 22 33", password: "motdepasse" }));
    expect(reg.status).toBe(200);
    const { token } = (await reg.json()) as { token: string };
    expect((await app.request("/api/shops/ma-boutique/register", J({ name: "Awa K", phone: "237699112233", password: "motdepasse" }))).status).toBe(409);
    expect((await app.request("/api/shops/ma-boutique/login", J({ phone: "237699112233", password: "mauvais" }))).status).toBe(401);
    expect((await app.request("/api/shops/ma-boutique/login", J({ phone: "237699112233", password: "motdepasse" }))).status).toBe(200);

    const view = (await (await app.request("/api/shops/ma-boutique")).json()) as { products: { id: string; price: number; stock: number | null }[] };
    const p = view.products[0]!;
    // Le client essaie de tricher sur le prix : le serveur l'ignore.
    const res = await app.request("/api/shops/ma-boutique/orders", J({ name: "Awa K", phone: "237699112233", address: "Akwa", method: "cod", items: [{ productId: p.id, qty: 2, price: 1 }] }, { authorization: `Bearer ${token}` }));
    expect(res.status).toBe(201);
    const { order } = (await res.json()) as { order: { number: number; total: number; subtotal: number; customerId: string | null } };
    expect(order.number).toBe(1);
    expect(order.subtotal).toBe(p.price * 2);
    expect(order.customerId).toBeTruthy();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.url).toContain("/bot123:SECRET/sendMessage");
    expect(sent[0]!.body).toContain("#1");

    const me = (await (await app.request("/api/shops/ma-boutique/me", { headers: { authorization: `Bearer ${token}` } })).json()) as { orders: unknown[] };
    expect(me.orders).toHaveLength(1);
    expect((await app.request("/api/shops/ma-boutique/me")).status).toBe(401);

    // Stock initial 3, 2 vendus : 2 de plus doivent être refusés, 1 accepté.
    const over = await app.request("/api/shops/ma-boutique/orders", J({ name: "Bob", phone: "237677000000", method: "cod", items: [{ productId: p.id, qty: 2 }] }));
    expect(over.status).toBe(409);
    expect((await over.json() as { error: string }).error).toContain("il n'en reste que 1");
    expect((await app.request("/api/shops/ma-boutique/orders", J({ name: "Bob", phone: "237677000000", method: "cod", items: [{ productId: p.id, qty: 1 }] }))).status).toBe(201);
  });

  it("valide les moyens de paiement", async () => {
    const { app } = await setup();
    const view = (await (await app.request("/api/shops/ma-boutique")).json()) as { products: { id: string }[] };
    const base = { name: "Awa K", phone: "237699112233", items: [{ productId: view.products[1]!.id, qty: 1 }] };
    expect((await app.request("/api/shops/ma-boutique/orders", J({ ...base, method: "momo" }))).status).toBe(400);
    const momo = await app.request("/api/shops/ma-boutique/orders", J({ ...base, method: "momo", paymentRef: "MP2411.1234" }));
    expect(momo.status).toBe(201);
    const m = (await momo.json()) as { order: { paymentStatus: string }; payment: { momo: unknown[] } };
    expect(m.order.paymentStatus).toBe("pending");
    expect(m.payment.momo).toHaveLength(1);
    const link = (await (await app.request("/api/shops/ma-boutique/orders", J({ ...base, method: "link" }))).json()) as { payment: { payUrl: string } };
    expect(link.payment.payUrl).toMatch(/^https:\/\/pay\.example\.com\/p\?amount=\d+&ref=\d+$/);
    expect((await app.request("/api/shops/ma-boutique/orders", J({ ...base, items: [{ productId: "inconnu", qty: 1 }], method: "cod" }))).status).toBe(400);
    expect((await app.request("/api/shops/ma-boutique/orders", J({ ...base, phone: "12", method: "cod" }))).status).toBe(400);
  });

  it("administration : clé requise, statuts, restockage à l'annulation, produits, stats et CSV", async () => {
    const { app, key } = await setup();
    const admin = (path: string, init: RequestInit = {}) => app.request(`/api/shops/ma-boutique/admin${path}`, { ...init, headers: { ...(init.headers as Record<string, string>), "x-admin-key": key, "content-type": "application/json" } });
    expect((await app.request("/api/shops/ma-boutique/admin/orders")).status).toBe(401);
    expect((await app.request("/api/shops/ma-boutique/admin/orders", { headers: { "x-admin-key": "faux" } })).status).toBe(401);

    const view = (await (await app.request("/api/shops/ma-boutique")).json()) as { products: { id: string }[] };
    const pid = view.products[0]!.id;
    const created = (await (await app.request("/api/shops/ma-boutique/orders", J({ name: "=cmd|calc", phone: "237699112233", method: "cod", items: [{ productId: pid, qty: 3 }] }))).json()) as { order: { id: string } };

    const list = (await (await admin("/orders")).json()) as { orders: { id: string; status: string }[]; products: { id: string; stock: number | null }[] };
    expect(list.orders).toHaveLength(1);
    expect(list.products.find((x) => x.id === pid)!.stock).toBe(0);

    const paid = await admin(`/orders/${created.order.id}`, { method: "PATCH", body: JSON.stringify({ status: "confirmed", paymentStatus: "paid" }) });
    expect(((await paid.json()) as { order: { status: string; paymentStatus: string } }).order).toMatchObject({ status: "confirmed", paymentStatus: "paid" });

    await admin(`/orders/${created.order.id}`, { method: "PATCH", body: JSON.stringify({ status: "cancelled" }) });
    await admin(`/orders/${created.order.id}`, { method: "PATCH", body: JSON.stringify({ status: "cancelled" }) });
    const after = (await (await admin("/orders")).json()) as { products: { id: string; stock: number | null }[] };
    expect(after.products.find((x) => x.id === pid)!.stock).toBe(3); // remis une seule fois

    const hide = await admin(`/products/${pid}`, { method: "PATCH", body: JSON.stringify({ active: false, stock: 5 }) });
    expect(hide.status).toBe(200);
    const pub = (await (await app.request("/api/shops/ma-boutique")).json()) as { products: { id: string }[] };
    expect(pub.products.some((x) => x.id === pid)).toBe(false);
    expect((await admin("/products/inconnu", { method: "PATCH", body: JSON.stringify({ active: true }) })).status).toBe(404);

    const stats = (await (await admin("/stats")).json()) as { all: { count: number } };
    expect(stats.all.count).toBe(0); // la seule commande est annulée
    const raw = new Uint8Array(await (await admin("/orders.csv")).arrayBuffer());
    expect([...raw.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // BOM UTF-8 pour Excel
    expect(new TextDecoder().decode(raw)).toContain("'=cmd|calc"); // formule neutralisée
  });

  it("deux commandes simultanées ne vendent jamais plus que le stock", async () => {
    const { app } = await setup();
    const view = (await (await app.request("/api/shops/ma-boutique")).json()) as { products: { id: string }[] };
    const pid = view.products[0]!.id;
    const one = () => app.request("/api/shops/ma-boutique/orders", J({ name: "Client", phone: "237699000111", method: "cod", items: [{ productId: pid, qty: 2 }] }));
    const codes = (await Promise.all([one(), one(), one()])).map((r) => r.status).sort();
    expect(codes).toEqual([201, 409, 409]);
  });
});

describe("FileStore", () => {
  it("relit les boutiques et commandes après un redémarrage", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "af-")), "d.json");
    const a1 = await createApp({ SESSION_SECRET: "k" }, { store: new FileStore(path) });
    const r = (await (await a1.request("/api/publish", J({ slug: "boutique-f", project: shopProject() }))).json()) as { adminKey: string };
    const view = (await (await a1.request("/api/shops/boutique-f")).json()) as { products: { id: string }[] };
    await a1.request("/api/shops/boutique-f/orders", J({ name: "Awa", phone: "237699112233", method: "cod", items: [{ productId: view.products[0]!.id, qty: 1 }] }));
    const a2 = await createApp({ SESSION_SECRET: "k" }, { store: new FileStore(path) });
    const list = (await (await a2.request("/api/shops/boutique-f/admin/orders", { headers: { "x-admin-key": r.adminKey } })).json()) as { orders: unknown[] };
    expect(list.orders).toHaveLength(1);
  });
});

describe("SupabaseStore (PostgREST simulé)", () => {
  /** Mini-PostgREST en mémoire : suffit pour vérifier les requêtes, la concurrence optimiste et les conflits. */
  function fakeSupabase() {
    const tables: Record<string, Record<string, unknown>[]> = { shops: [], orders: [], customers: [] };
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      const table = url.pathname.split("/").pop()!;
      const method = init?.method ?? "GET";
      calls.push(`${method} ${table}${url.search}`);
      const rows = tables[table]!;
      const filters = [...url.searchParams.entries()].filter(([k]) => !["select", "order", "limit"].includes(k)).map(([k, v]) => [k, v.replace(/^eq\./, "")] as const);
      const match = (r: Record<string, unknown>) => filters.every(([k, v]) => String(r[k]) === v);
      const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
      if (method === "GET") return json(rows.filter(match));
      if (method === "POST") {
        const row = JSON.parse(String(init!.body)) as Record<string, unknown>;
        const key = table === "shops" ? ["slug"] : table === "orders" ? ["slug", "number"] : ["slug", "phone"];
        if (rows.some((r) => key.every((k) => r[k] === row[k])) || (table !== "shops" && rows.some((r) => r.id === row.id))) return json({ code: "23505" }, 409);
        rows.push(row);
        return new Response(null, { status: 201 });
      }
      if (method === "PATCH") {
        const hit = rows.filter(match);
        hit.forEach((r) => Object.assign(r, JSON.parse(String(init!.body))));
        return json(hit);
      }
      if (method === "DELETE") {
        tables[table] = rows.filter((r) => !match(r));
        return new Response(null, { status: 204 });
      }
      return json([], 400);
    }) as unknown as typeof fetch;
    return { fetchImpl, tables, calls };
  }

  it("publie, commande, et rejoue après un conflit de version sans vendre plus que le stock", async () => {
    const { fetchImpl, tables } = fakeSupabase();
    const app = await createApp({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_KEY: "svc" }, { fetchImpl });
    expect(((await (await app.request("/api/health")).json()) as { storage: string }).storage).toBe("supabase");
    const pub = await app.request("/api/publish", J({ slug: "sb-shop", project: shopProject() }));
    expect(pub.status).toBe(200);
    expect(tables.shops!).toHaveLength(1);
    expect(tables.shops![0]!.owner_hash).toMatch(/^[0-9a-f]{64}$/);

    const view = (await (await app.request("/api/shops/sb-shop")).json()) as { products: { id: string }[] };
    const pid = view.products[0]!.id;
    const one = () => app.request("/api/shops/sb-shop/orders", J({ name: "Client", phone: "237699000111", method: "cod", items: [{ productId: pid, qty: 2 }] }));
    const codes = (await Promise.all([one(), one()])).map((r) => r.status).sort();
    expect(codes).toEqual([201, 409]);
    expect(tables.orders).toHaveLength(1);
    expect(tables.shops![0]!.order_seq).toBe(1);
    expect(tables.shops![0]!.rev).toBe(2);
  });

  it("le SupabaseStore envoie la clé service et propage les erreurs", async () => {
    const fetchImpl = vi.fn(async () => new Response("boom", { status: 500 })) as unknown as typeof fetch;
    const store = new SupabaseStore("https://x.supabase.co/", "svc", fetchImpl);
    await expect(store.getShop("abc")).rejects.toThrow(/Supabase 500/);
    const init = vi.mocked(fetchImpl).mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>).apikey).toBe("svc");
  });
});

describe("compilation de l'APK (GitHub Actions)", () => {
  const gh = (status: number, calls: { url: string; body: string }[]) =>
    (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: String(init?.body ?? "") });
      return new Response(status === 204 ? null : "{}", { status });
    }) as unknown as typeof fetch;

  async function build(env: Record<string, string>, status: number, key?: string) {
    const calls: { url: string; body: string }[] = [];
    const store = new Persistent();
    const app = await createApp({ SESSION_SECRET: "k", ...env }, { store, fetchImpl: gh(status, calls) });
    const pub = (await (await app.request("/api/publish", J({ slug: "apk-shop", project: shopProject() }))).json()) as { adminKey: string };
    const res = await app.request("/api/apk/build", J({ slug: "apk-shop", key: key ?? pub.adminKey }));
    return { res, calls: calls.filter((c) => c.url.includes("dispatches")) };
  }

  it("lance le workflow avec les bonnes entrées", async () => {
    const { res, calls } = await build({ GITHUB_TOKEN: "t", GITHUB_REPO: "o/r", PUBLIC_URL: "https://mon-site.vercel.app" }, 204);
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.github.com/repos/o/r/actions/workflows/apk.yml/dispatches");
    expect(JSON.parse(calls[0]!.body)).toEqual({ ref: "main", inputs: { slug: "apk-shop", url: "https://mon-site.vercel.app/a/apk-shop", name: "Ma boutique", color: "#c2410c" } });
  });

  it("refuse une mauvaise clé, l'absence de jeton et une adresse non https", async () => {
    expect((await build({ GITHUB_TOKEN: "t", PUBLIC_URL: "https://x.app" }, 204, "af_faux")).res.status).toBe(401);
    const none = await build({ PUBLIC_URL: "https://x.app" }, 204);
    expect(none.res.status).toBe(503);
    expect(none.calls).toHaveLength(0);
    expect((await build({ GITHUB_TOKEN: "t", PUBLIC_URL: "http://x.app" }, 204)).res.status).toBe(400);
  });

  it("traduit les erreurs GitHub en messages clairs", async () => {
    const e403 = await build({ GITHUB_TOKEN: "t", PUBLIC_URL: "https://x.app" }, 403);
    expect(e403.res.status).toBe(502);
    expect(((await e403.res.json()) as { error: string }).error).toContain("Actions");
    const e404 = await build({ GITHUB_TOKEN: "t", PUBLIC_URL: "https://x.app" }, 404);
    expect(((await e404.res.json()) as { error: string }).error).toContain("apk.yml");
  });
});
