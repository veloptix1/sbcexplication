import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import {
  LoginInput, METHOD_LABEL, NEXT_STATUS, ORDER_STATUSES, OrderInput, PAYMENT_STATUSES, PAYMENT_STATUS_LABEL, RegisterInput, STATUS_LABEL,
  computeTotals, fillPayUrl, money, normalizePhone, type Order, type OrderStatus, type PaymentStatus,
} from "../core/app-model.js";
import { renderSite } from "../core/render-site.js";
import { AppProject, Project, isPageLike, normalizeProject, type PageLike } from "../core/schema.js";
import { uid } from "../core/util.js";
import { hashPassword, randomToken, safeEqual, sha256Hex, signToken, verifyPassword, verifyToken } from "./auth.js";
import { RateLimiter } from "./rate-limit.js";
import type { ShopRecord, Store } from "./store.js";

export interface ShopContext {
  store: Store;
  secret: string;
  fetchImpl: typeof fetch;
  telegramBase: string;
  clientIp: (c: Context) => string;
}

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])$/;
const RESERVED = new Set(["api", "a", "s", "admin", "assets", "static", "app", "www", "login", "dashboard"]);

const PublishBody = z.object({ slug: z.string().trim().toLowerCase(), project: z.unknown(), key: z.string().max(100).optional() });

/** Retire tout ce qui est secret avant d'envoyer le projet publié à un visiteur. */
export function publicView(p: PageLike) {
  if (p.kind !== "app") return { kind: p.kind, name: p.name, settings: p.settings, blocks: p.blocks };
  return {
    kind: p.kind,
    name: p.name,
    settings: p.settings,
    blocks: p.blocks,
    shop: p.shop,
    payments: p.payments,
    products: p.products.filter((x) => x.active),
  };
}

export function createShopRoutes(ctx: ShopContext): Hono {
  const r = new Hono();
  const { store } = ctx;
  const publishLimiter = new RateLimiter(30);
  const authLimiter = new RateLimiter(40);
  const orderLimiter = new RateLimiter(30);
  const adminFail = new RateLimiter(30, 600_000);

  const getShop = async (slug: string): Promise<ShopRecord | null> => (SLUG.test(slug) ? store.getShop(slug) : null);

  const requireAdmin = async (c: Context, shop: ShopRecord, given?: string): Promise<Response | null> => {
    const ip = ctx.clientIp(c);
    const key = given ?? c.req.header("x-admin-key") ?? "";
    const ok = key.length > 0 && safeEqual(await sha256Hex(key), shop.ownerHash);
    if (ok) return null;
    // Compte seulement les échecs : on freine la devinette sans bloquer le propriétaire légitime.
    const wait = adminFail.hit(`${shop.slug}:${ip}`);
    if (wait > 0) {
      c.header("Retry-After", String(wait));
      return c.json({ error: "Trop d'essais. Réessaie dans quelques minutes." }, 429);
    }
    return c.json({ error: "Clé d'administration invalide." }, 401);
  };

  const customerOf = async (c: Context, slug: string): Promise<string | null> => {
    const h = c.req.header("authorization") ?? "";
    const token = h.startsWith("Bearer ") ? h.slice(7) : "";
    return token ? verifyToken(ctx.secret, token, slug) : null;
  };

  /* ---------------- publication ---------------- */

  r.post(
    "/api/publish",
    bodyLimit({ maxSize: 600 * 1024, onError: (c) => c.json({ error: "Projet trop volumineux (600 Ko maximum, retire les grosses images intégrées)." }, 413) }),
    async (c) => {
      if (!store.persistent) {
        return c.json({ error: "Ce serveur n'a pas de base de données : les boutiques publiées seraient perdues au redémarrage. Configure Supabase (voir le README) ou lance le serveur Node avec un dossier de données.", code: "no_storage" }, 503);
      }
      const wait = publishLimiter.hit(ctx.clientIp(c));
      if (wait > 0) return c.json({ error: "Trop de publications. Réessaie plus tard." }, 429);

      const body = PublishBody.safeParse(await c.req.json().catch(() => null));
      if (!body.success) return c.json({ error: "Requête invalide." }, 400);
      const { slug, key } = body.data;
      if (!SLUG.test(slug) || RESERVED.has(slug)) return c.json({ error: "Adresse invalide : 2 à 40 caractères, lettres minuscules, chiffres et tirets, sans tiret au début ni à la fin." }, 400);

      const parsed = Project.safeParse(body.data.project);
      if (!parsed.success) return c.json({ error: "Projet invalide : " + (parsed.error.issues[0]?.message ?? "structure inconnue") }, 400);
      const project = normalizeProject(parsed.data);
      if (!isPageLike(project)) return c.json({ error: "Les bots Telegram se lancent avec leur fichier bot.mjs, ils ne se publient pas ici." }, 400);
      const published: PageLike = { ...project, publication: { slug } };

      const existing = await store.getShop(slug);
      if (existing) {
        if (!key) return c.json({ error: "Cette adresse est déjà prise. Choisis-en une autre, ou fournis la clé d'administration de cette boutique pour la mettre à jour.", code: "slug_taken" }, 409);
        const failure = await requireAdmin(c, existing, key);
        if (failure) return failure;
        // Mise à jour : on garde les stocks courants des produits déjà connus quand l'auteur ne les a pas changés.
        const merged = existing.project.kind === "app" && published.kind === "app" ? mergeStocks(existing.project, published) : published;
        await store.updateProject(slug, merged);
        return c.json({ slug, url: `/${merged.kind === "app" ? "a" : "s"}/${slug}`, created: false });
      }

      const newKey = `af_${randomToken(18)}`;
      const now = Date.now();
      const ok = await store.createShop({ slug, ownerHash: await sha256Hex(newKey), project: published, createdAt: now, updatedAt: now });
      if (!ok) return c.json({ error: "Cette adresse vient d'être prise. Choisis-en une autre.", code: "slug_taken" }, 409);
      return c.json({ slug, url: `/${published.kind === "app" ? "a" : "s"}/${slug}`, created: true, adminKey: newKey });
    },
  );

  /** Page statique publiée (site ou page). Les applications ont leur propre interface sous /a/. */
  r.get("/s/:slug", async (c) => {
    const shop = await getShop(c.req.param("slug"));
    if (!shop) return c.html("<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>Introuvable</title><body style='font:16px system-ui;padding:2rem'><h1>Page introuvable</h1><p>Cette adresse n'existe pas ou a été retirée.</p>", 404);
    if (shop.project.kind === "app") return c.redirect(`/a/${shop.slug}`, 302);
    c.header("Content-Security-Policy", "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; frame-src https://www.youtube-nocookie.com https://player.vimeo.com; base-uri 'none'; form-action 'none'");
    c.header("Cache-Control", "public, max-age=60");
    return c.html(renderSite(shop.project));
  });

  /* ---------------- boutique publique ---------------- */

  r.get("/api/shops/:slug", async (c) => {
    const shop = await getShop(c.req.param("slug"));
    if (!shop) return c.json({ error: "Boutique introuvable." }, 404);
    c.header("Cache-Control", "no-store");
    return c.json(publicView(shop.project));
  });

  r.post("/api/shops/:slug/register", bodyLimit({ maxSize: 4096, onError: (c) => c.json({ error: "Requête trop volumineuse." }, 413) }), async (c) => {
    const shop = await getShop(c.req.param("slug"));
    if (!shop || shop.project.kind !== "app") return c.json({ error: "Boutique introuvable." }, 404);
    if (authLimiter.hit(ctx.clientIp(c)) > 0) return c.json({ error: "Trop d'essais. Réessaie plus tard." }, 429);
    const body = RegisterInput.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: body.error.issues[0]?.message ?? "Requête invalide." }, 400);
    const phone = normalizePhone(body.data.phone);
    if (!phone) return c.json({ error: "Numéro de téléphone invalide (avec l'indicatif, par exemple 237600000000)." }, 400);
    const customer = { id: uid(), name: body.data.name, phone, passHash: await hashPassword(body.data.password), createdAt: Date.now() };
    if (!(await store.createCustomer(shop.slug, customer))) return c.json({ error: "Un compte existe déjà avec ce numéro. Connecte-toi." }, 409);
    return c.json({ token: await signToken(ctx.secret, shop.slug, customer.id), customer: { id: customer.id, name: customer.name, phone } });
  });

  r.post("/api/shops/:slug/login", bodyLimit({ maxSize: 4096, onError: (c) => c.json({ error: "Requête trop volumineuse." }, 413) }), async (c) => {
    const shop = await getShop(c.req.param("slug"));
    if (!shop || shop.project.kind !== "app") return c.json({ error: "Boutique introuvable." }, 404);
    if (authLimiter.hit(ctx.clientIp(c)) > 0) return c.json({ error: "Trop d'essais. Réessaie plus tard." }, 429);
    const body = LoginInput.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "Requête invalide." }, 400);
    const phone = normalizePhone(body.data.phone);
    const found = phone ? await store.getCustomerByPhone(shop.slug, phone) : null;
    // Même réponse (et même coût de calcul) que le compte existe ou non.
    const good = await verifyPassword(body.data.password, found?.passHash ?? "pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    if (!found || !good) return c.json({ error: "Numéro ou mot de passe incorrect." }, 401);
    return c.json({ token: await signToken(ctx.secret, shop.slug, found.id), customer: { id: found.id, name: found.name, phone: found.phone } });
  });

  r.get("/api/shops/:slug/me", async (c) => {
    const shop = await getShop(c.req.param("slug"));
    if (!shop) return c.json({ error: "Boutique introuvable." }, 404);
    const id = await customerOf(c, shop.slug);
    const customer = id ? await store.getCustomer(shop.slug, id) : null;
    if (!customer) return c.json({ error: "Session expirée. Reconnecte-toi." }, 401);
    const orders = await store.listOrders(shop.slug, { customerId: customer.id, limit: 50 });
    return c.json({ customer: { id: customer.id, name: customer.name, phone: customer.phone }, orders });
  });

  r.post("/api/shops/:slug/orders", bodyLimit({ maxSize: 16 * 1024, onError: (c) => c.json({ error: "Requête trop volumineuse." }, 413) }), async (c) => {
    const shop = await getShop(c.req.param("slug"));
    if (!shop || shop.project.kind !== "app") return c.json({ error: "Boutique introuvable." }, 404);
    if (orderLimiter.hit(ctx.clientIp(c)) > 0) return c.json({ error: "Trop de commandes depuis cet appareil. Réessaie plus tard." }, 429);

    const body = OrderInput.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: body.error.issues[0]?.message ?? "Commande invalide." }, 400);
    const input = body.data;
    const phone = normalizePhone(input.phone);
    if (!phone) return c.json({ error: "Numéro de téléphone invalide (avec l'indicatif, par exemple 237600000000)." }, 400);
    const customerId = await customerOf(c, shop.slug);

    const now = Date.now();
    const out = await store.placeOrder(shop.slug, (fresh, number) => {
      const app = fresh.project;
      if (app.kind !== "app") return { ok: false, error: "Boutique introuvable.", status: 404 };
      const need = new Map<string, number>();
      for (const it of input.items) need.set(it.productId, (need.get(it.productId) ?? 0) + it.qty);

      const lines: Order["lines"] = [];
      for (const [productId, qty] of need) {
        const p = app.products.find((x) => x.id === productId && x.active);
        if (!p) return { ok: false, error: "Un produit de ton panier n'est plus disponible.", status: 400 };
        if (p.stock !== null && p.stock < qty) return { ok: false, error: p.stock === 0 ? `« ${p.name} » est épuisé.` : `« ${p.name} » : il n'en reste que ${p.stock}.`, status: 409 };
        lines.push({ productId, name: p.name, price: p.price, qty });
      }
      const totals = computeTotals(lines, app.shop);
      if (app.shop.minOrder > 0 && totals.subtotal < app.shop.minOrder) return { ok: false, error: `Commande minimum : ${money(app.shop.minOrder, app.shop.currency)}.`, status: 400 };

      const pay = app.payments;
      if (input.method === "cod" && !pay.cod) return { ok: false, error: "Le paiement à la livraison n'est pas proposé.", status: 400 };
      if (input.method === "momo" && pay.momo.length === 0) return { ok: false, error: "Le paiement Mobile Money n'est pas proposé.", status: 400 };
      if (input.method === "momo" && input.paymentRef.length < 4) return { ok: false, error: "Indique le numéro de la transaction Mobile Money une fois le paiement fait.", status: 400 };
      if (input.method === "link" && !fillPayUrl(pay.linkUrl, { amount: totals.total, order: number })) return { ok: false, error: "Le paiement en ligne n'est pas proposé.", status: 400 };

      const order: Order = {
        id: uid(), number, customerId, name: input.name, phone, address: input.address, note: input.note, lines, ...totals,
        currency: app.shop.currency, method: input.method, paymentRef: input.paymentRef,
        paymentStatus: input.method === "cod" ? "unpaid" : "pending", status: "new", createdAt: now,
      };
      const products = app.products.map((p) => (p.stock !== null && need.has(p.id) ? { ...p, stock: p.stock - (need.get(p.id) ?? 0) } : p));
      return { ok: true, order, project: { ...app, products } };
    });
    if (!out.ok) return c.json({ error: out.error }, out.status);

    const app = out.project;
    void notifyOrder(ctx, app, out.order);
    const payUrl = app.kind === "app" && out.order.method === "link" ? fillPayUrl(app.payments.linkUrl, { amount: out.order.total, order: out.order.number }) : null;
    return c.json({ order: out.order, payment: { momo: app.kind === "app" && out.order.method === "momo" ? app.payments.momo : [], payUrl } }, 201);
  });

  /* ---------------- administration ---------------- */

  const admin = new Hono<{ Variables: { shop: ShopRecord } }>();
  admin.use("*", async (c, next) => {
    const shop = await getShop(c.req.param("slug") ?? "");
    if (!shop) return c.json({ error: "Boutique introuvable." }, 404);
    const failure = await requireAdmin(c, shop);
    if (failure) return failure;
    c.set("shop", shop);
    await next();
  });

  admin.get("/ping", (c) => c.json({ ok: true, name: c.get("shop").project.name, kind: c.get("shop").project.kind }));

  admin.get("/orders", async (c) => {
    const shop = c.get("shop");
    const orders = await store.listOrders(shop.slug, { limit: 500 });
    return c.json({ orders, products: shop.project.kind === "app" ? shop.project.products : [], currency: shop.project.kind === "app" ? shop.project.shop.currency : "" });
  });

  admin.get("/stats", async (c) => {
    const orders = await store.listOrders(c.get("shop").slug, { limit: 2000 });
    const live = orders.filter((o) => o.status !== "cancelled");
    const day = 86_400_000;
    const since = (ms: number) => live.filter((o) => Date.now() - o.createdAt < ms);
    const sum = (list: Order[]) => list.reduce((s, o) => s + o.total, 0);
    const top = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const o of live) for (const l of o.lines) {
      const t = top.get(l.productId) ?? { name: l.name, qty: 0, revenue: 0 };
      t.qty += l.qty;
      t.revenue += l.qty * l.price;
      top.set(l.productId, t);
    }
    return c.json({
      toNotify: orders.filter((o) => o.status === "new").length,
      toVerify: orders.filter((o) => o.paymentStatus === "pending" && o.status !== "cancelled").length,
      today: { count: since(day).length, revenue: sum(since(day)) },
      week: { count: since(7 * day).length, revenue: sum(since(7 * day)) },
      all: { count: live.length, revenue: sum(live) },
      top: [...top.values()].sort((a, b) => b.qty - a.qty).slice(0, 5),
    });
  });

  const OrderPatch = z.object({ status: z.enum(ORDER_STATUSES).optional(), paymentStatus: z.enum(PAYMENT_STATUSES).optional() }).refine((v) => v.status || v.paymentStatus, "Rien à modifier.");
  admin.patch("/orders/:id", async (c) => {
    const shop = c.get("shop");
    const body = OrderPatch.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "Requête invalide." }, 400);
    const before = await store.getOrder(shop.slug, c.req.param("id"));
    if (!before) return c.json({ error: "Commande introuvable." }, 404);
    const patch: { status?: OrderStatus; paymentStatus?: PaymentStatus } = {};
    if (body.data.status) patch.status = body.data.status;
    if (body.data.paymentStatus) patch.paymentStatus = body.data.paymentStatus;
    const after = await store.updateOrder(shop.slug, before.id, patch);
    // Annulation : on remet les articles en stock (et seulement une fois).
    if (after && patch.status === "cancelled" && before.status !== "cancelled") {
      await store.mutateProject(shop.slug, (p) => {
        if (p.kind !== "app") return p;
        const back = new Map(before.lines.map((l) => [l.productId, l.qty]));
        return { ...p, products: p.products.map((x) => (x.stock !== null && back.has(x.id) ? { ...x, stock: x.stock + (back.get(x.id) ?? 0) } : x)) };
      });
    }
    return c.json({ order: after });
  });

  const ProductPatch = z.object({ active: z.boolean().optional(), stock: z.number().int().min(0).max(1_000_000).nullable().optional(), price: z.number().min(0).max(1e9).optional() });
  admin.patch("/products/:id", async (c) => {
    const shop = c.get("shop");
    const body = ProductPatch.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "Requête invalide." }, 400);
    const id = c.req.param("id");
    let found = false;
    const updated = await store.mutateProject(shop.slug, (p) => {
      if (p.kind !== "app") return p;
      return { ...p, products: p.products.map((x) => (x.id === id ? ((found = true), { ...x, ...body.data }) : x)) };
    });
    if (!updated || !found) return c.json({ error: "Produit introuvable." }, 404);
    return c.json({ products: updated.kind === "app" ? updated.products : [] });
  });

  admin.get("/customers", async (c) => c.json({ customers: await store.listCustomers(c.get("shop").slug, 500) }));

  admin.get("/orders.csv", async (c) => {
    const shop = c.get("shop");
    const orders = await store.listOrders(shop.slug, { limit: 5000 });
    const cell = (v: unknown): string => {
      let s = String(v ?? "");
      if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // neutralise les formules Excel
      return `"${s.replaceAll('"', '""')}"`;
    };
    const head = ["Numéro", "Date", "Client", "Téléphone", "Adresse", "Articles", "Sous-total", "Livraison", "Total", "Devise", "Paiement", "Statut paiement", "Référence", "Statut", "Note"];
    const rows = orders.map((o) => [
      o.number, new Date(o.createdAt).toISOString(), o.name, o.phone, o.address, o.lines.map((l) => `${l.qty} × ${l.name}`).join(" ; "),
      o.subtotal, o.deliveryFee, o.total, o.currency, METHOD_LABEL[o.method], PAYMENT_STATUS_LABEL[o.paymentStatus], o.paymentRef, STATUS_LABEL[o.status], o.note,
    ]);
    c.header("Content-Type", "text/csv; charset=utf-8");
    c.header("Content-Disposition", `attachment; filename="commandes-${shop.slug}.csv"`);
    return c.body("﻿" + [head, ...rows].map((row) => row.map(cell).join(",")).join("\r\n"));
  });

  r.route("/api/shops/:slug/admin", admin);
  return r;
}

/** Avance suggérée pour un bouton « étape suivante » côté interface. */
export const nextStatus = (s: OrderStatus): OrderStatus | null => NEXT_STATUS[s];

/** Fusionne les stocks : si le projet republié ne change pas le stock d'un produit, on garde le stock courant du serveur. */
function mergeStocks(current: AppProject, incoming: AppProject): AppProject {
  const live = new Map(current.products.map((p) => [p.id, p.stock]));
  return { ...incoming, products: incoming.products.map((p) => (live.has(p.id) && live.get(p.id) !== undefined && p.stock !== null && live.get(p.id) !== null ? { ...p, stock: live.get(p.id) ?? p.stock } : p)) };
}

/** Alerte Telegram vers le commerçant. Échec silencieux : une commande ne doit jamais échouer à cause d'une notification. */
async function notifyOrder(ctx: ShopContext, project: PageLike, o: Order): Promise<void> {
  if (project.kind !== "app") return;
  const { telegramBotToken: token, telegramChatId: chat } = project.notify;
  if (!token || !chat) return;
  const lines = o.lines.map((l) => `• ${l.qty} × ${l.name}`).join("\n");
  const text = [
    `🛒 Nouvelle commande #${o.number} — ${project.name}`,
    "",
    lines,
    "",
    `Total : ${money(o.total, o.currency)}`,
    `Paiement : ${METHOD_LABEL[o.method]}${o.paymentRef ? ` (réf. ${o.paymentRef})` : ""}`,
    `Client : ${o.name} — +${o.phone}`,
    o.address ? `Adresse : ${o.address}` : "",
    o.note ? `Note : ${o.note}` : "",
  ].filter(Boolean).join("\n");
  try {
    await ctx.fetchImpl(`${ctx.telegramBase}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text }),
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    /* ignoré */
  }
}
