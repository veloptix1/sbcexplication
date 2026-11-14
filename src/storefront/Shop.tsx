import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { METHOD_LABEL, PAYMENT_STATUS_LABEL, STATUS_LABEL, computeTotals, money, type Customer, type Order, type PaymentMethod } from "../core/app-model.js";
import { renderFragment } from "../core/render-site.js";
import { safeUrl, waLink } from "../core/util.js";
import { ApiError, shopApi, storage, type OrderResult, type PublicShop } from "./api.js";

type View = "home" | "shop" | "cart" | "account" | "done";
type Cart = Record<string, number>;

const cartKey = (slug: string) => `af:cart:${slug}`;
const tokenKey = (slug: string) => `af:token:${slug}`;
const readCart = (slug: string): Cart => {
  try {
    const raw = JSON.parse(storage.get(cartKey(slug)) || "{}") as Record<string, unknown>;
    return Object.fromEntries(Object.entries(raw).filter(([, v]) => Number.isInteger(v) && (v as number) > 0)) as Cart;
  } catch {
    return {};
  }
};

export function Shop({ slug }: { slug: string }) {
  const [shop, setShop] = useState<PublicShop | null>(null);
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("home");
  const [cart, setCart] = useState<Cart>(() => readCart(slug));
  const [token, setToken] = useState(() => storage.get(tokenKey(slug)));
  const [me, setMe] = useState<Pick<Customer, "id" | "name" | "phone"> | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [result, setResult] = useState<OrderResult | null>(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    shopApi.load(slug).then(setShop, (e: unknown) => setError(e instanceof ApiError && e.status === 404 ? "Cette boutique n'existe pas ou a été retirée." : e instanceof Error ? e.message : "Erreur"));
  }, [slug]);

  useEffect(() => { storage.set(cartKey(slug), Object.keys(cart).length ? JSON.stringify(cart) : ""); }, [cart, slug]);

  const refreshMe = useCallback(async () => {
    if (!token) { setMe(null); setOrders([]); return; }
    try {
      const r = await shopApi.me(slug, token);
      setMe(r.customer);
      setOrders(r.orders);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { storage.set(tokenKey(slug), ""); setToken(""); setMe(null); }
    }
  }, [slug, token]);
  useEffect(() => { void refreshMe(); }, [refreshMe]);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 2500); };

  // Thème de la boutique : mêmes variables et mêmes styles que les pages publiées.
  const frag = useMemo(() => (shop ? renderFragment({ ...shop, notify: { telegramBotToken: "", telegramChatId: "" } }) : null), [shop]);
  useEffect(() => {
    if (!shop) return;
    document.title = shop.settings.title || shop.name;
    document.documentElement.lang = shop.settings.lang;
  }, [shop]);

  if (error) return <div className="sf-center"><h1>Oups</h1><p>{error}</p></div>;
  if (!shop || !frag) return <div className="sf-center" role="status">Chargement…</div>;

  const cur = shop.shop.currency;
  const lines = Object.entries(cart).flatMap(([id, qty]) => {
    const p = shop.products.find((x) => x.id === id);
    return p ? [{ productId: id, name: p.name, price: p.price, qty, stock: p.stock }] : [];
  });
  const count = lines.reduce((n, l) => n + l.qty, 0);
  const totals = computeTotals(lines, shop.shop);

  const setQty = (id: string, qty: number) => setCart((c) => {
    const next = { ...c };
    const p = shop.products.find((x) => x.id === id);
    const max = p?.stock ?? 50;
    const q = Math.min(Math.max(0, qty), Math.min(50, max));
    if (q === 0) delete next[id]; else next[id] = q;
    return next;
  });

  const nav: [View, string, string][] = [["home", "Accueil", "🏠"], ["shop", "Boutique", "🛍️"], ["cart", count ? `Panier (${count})` : "Panier", "🧺"], ["account", "Compte", "👤"]];

  return (
    <div className="sf">
      <style>{frag.css}</style>
      <header className="sf-top">
        <span className="sf-emoji" aria-hidden="true">{shop.settings.emoji}</span>
        <strong>{shop.name}</strong>
        <button type="button" className="sf-cartbtn" onClick={() => setView("cart")} aria-label={`Panier, ${count} article${count > 1 ? "s" : ""}`}>🧺{count ? <b>{count}</b> : null}</button>
      </header>

      <main className="sf-main" id="main">
        {view === "home" && <Home html={frag.html} onShop={() => setView("shop")} />}
        {view === "shop" && <Catalogue shop={shop} cart={cart} setQty={setQty} />}
        {view === "cart" && (
          <CartView shop={shop} lines={lines} totals={totals} setQty={setQty} token={token} me={me}
            onNeedAccount={() => setView("account")} onBrowse={() => setView("shop")}
            onDone={(r) => { setResult(r); setCart({}); setView("done"); void refreshMe(); }} slug={slug} />
        )}
        {view === "account" && (
          <Account slug={slug} me={me} orders={orders} cur={cur}
            onAuth={(t) => { storage.set(tokenKey(slug), t); setToken(t); flash("Connecté."); setView(count ? "cart" : "account"); }}
            onLogout={() => { storage.set(tokenKey(slug), ""); setToken(""); setMe(null); setOrders([]); }} />
        )}
        {view === "done" && result && <Done shop={shop} result={result} onBack={() => setView("shop")} />}
      </main>

      {toast ? <div className="sf-toast" role="status">{toast}</div> : null}
      <nav className="sf-nav" aria-label="Navigation">
        {nav.map(([v, label, icon]) => (
          <button key={v} type="button" aria-current={view === v ? "page" : undefined} onClick={() => setView(v)}>
            <span aria-hidden="true">{icon}</span>{label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function Home({ html, onShop }: { html: string; onShop: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  // Les boutons « #shop » du modèle ouvrent le catalogue ; les autres ancres défilent normalement.
  const onClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest("a");
    if (a && a.getAttribute("href") === "#shop") { e.preventDefault(); onShop(); }
  };
  return (
    <div ref={ref} className="sf-home" onClick={onClick}>
      <div dangerouslySetInnerHTML={{ __html: html }} />
      <div className="wrap" style={{ padding: "8px 0 24px" }}><button type="button" className="sf-btn" onClick={onShop}>Voir la boutique</button></div>
    </div>
  );
}

function Thumbnail({ p }: { p: PublicShop["products"][number] }) {
  const src = p.image ? safeUrl(p.image) : "";
  return src && src !== "#" ? <img src={src} alt="" loading="lazy" /> : <span className="sf-ph" aria-hidden="true">{p.name.slice(0, 1).toUpperCase()}</span>;
}

function Catalogue({ shop, cart, setQty }: { shop: PublicShop; cart: Cart; setQty: (id: string, q: number) => void }) {
  const cats = useMemo(() => [...new Set(shop.products.map((p) => p.category).filter(Boolean))], [shop.products]);
  const [cat, setCat] = useState("");
  const [q, setQ] = useState("");
  const shown = shop.products.filter((p) => (!cat || p.category === cat) && (!q || p.name.toLowerCase().includes(q.toLowerCase())));
  return (
    <section className="wrap sf-pad" aria-label="Catalogue">
      <input className="sf-search" type="search" placeholder="Rechercher un produit" aria-label="Rechercher un produit" value={q} onChange={(e) => setQ(e.target.value)} />
      {cats.length > 0 && (
        <div className="sf-chips" role="group" aria-label="Catégories">
          <button type="button" aria-pressed={!cat} onClick={() => setCat("")}>Tout</button>
          {cats.map((c) => <button key={c} type="button" aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>)}
        </div>
      )}
      {shown.length === 0 ? <p className="muted">Aucun produit ne correspond.</p> : (
        <ul className="sf-products">
          {shown.map((p) => {
            const qty = cart[p.id] ?? 0;
            const out = p.stock === 0;
            return (
              <li key={p.id} className={out ? "out" : ""}>
                <div className="sf-img"><Thumbnail p={p} /></div>
                <div className="sf-pbody">
                  <strong>{p.name}</strong>
                  {p.description ? <small>{p.description}</small> : null}
                  <span className="sf-price">{money(p.price, shop.shop.currency)}</span>
                  {p.stock !== null && p.stock > 0 && p.stock <= 5 ? <small className="sf-low">Plus que {p.stock}</small> : null}
                </div>
                {out ? <span className="sf-soldout">Épuisé</span> : qty === 0 ? (
                  <button type="button" className="sf-add" onClick={() => setQty(p.id, 1)} aria-label={`Ajouter ${p.name} au panier`}>Ajouter</button>
                ) : (
                  <div className="sf-qty" role="group" aria-label={`Quantité de ${p.name}`}>
                    <button type="button" onClick={() => setQty(p.id, qty - 1)} aria-label="Retirer un">−</button>
                    <output>{qty}</output>
                    <button type="button" onClick={() => setQty(p.id, qty + 1)} aria-label="Ajouter un" disabled={p.stock !== null && qty >= p.stock}>+</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

interface CartLine { productId: string; name: string; price: number; qty: number }

function CartView({ shop, lines, totals, setQty, token, me, onNeedAccount, onBrowse, onDone, slug }: {
  shop: PublicShop; lines: CartLine[]; totals: ReturnType<typeof computeTotals>; setQty: (id: string, q: number) => void;
  token: string; me: { name: string; phone: string } | null; onNeedAccount: () => void; onBrowse: () => void; onDone: (r: OrderResult) => void; slug: string;
}) {
  const cur = shop.shop.currency;
  const pay = shop.payments;
  const methods: PaymentMethod[] = [...(pay.cod ? ["cod" as const] : []), ...(pay.momo.length ? ["momo" as const] : []), ...(pay.linkUrl ? ["link" as const] : [])];
  const [name, setName] = useState(me?.name ?? "");
  const [phone, setPhone] = useState(me?.phone ?? "");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [method, setMethod] = useState<PaymentMethod>(methods[0] ?? "cod");
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { if (me) { setName((n) => n || me.name); setPhone((p) => p || me.phone); } }, [me]);

  if (lines.length === 0) return <section className="wrap sf-pad sf-empty"><h2>Ton panier est vide</h2><p className="muted">Ajoute des produits depuis la boutique.</p><button type="button" className="sf-btn" onClick={onBrowse}>Voir la boutique</button></section>;

  const belowMin = shop.shop.minOrder > 0 && totals.subtotal < shop.shop.minOrder;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const r = await shopApi.order(slug, { name, phone, address, note, method, paymentRef: ref, items: lines.map((l) => ({ productId: l.productId, qty: l.qty })) }, token);
      onDone(r);
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="wrap sf-pad" aria-label="Panier">
      <h2>Ton panier</h2>
      <ul className="sf-lines">
        {lines.map((l) => (
          <li key={l.productId}>
            <span>{l.name}<small>{money(l.price, cur)}</small></span>
            <div className="sf-qty">
              <button type="button" onClick={() => setQty(l.productId, l.qty - 1)} aria-label={`Retirer un ${l.name}`}>−</button>
              <output>{l.qty}</output>
              <button type="button" onClick={() => setQty(l.productId, l.qty + 1)} aria-label={`Ajouter un ${l.name}`}>+</button>
            </div>
            <b>{money(l.price * l.qty, cur)}</b>
          </li>
        ))}
      </ul>
      <dl className="sf-totals">
        <div><dt>Sous-total</dt><dd>{money(totals.subtotal, cur)}</dd></div>
        <div><dt>Livraison</dt><dd>{totals.deliveryFee ? money(totals.deliveryFee, cur) : "Offerte"}</dd></div>
        <div className="grand"><dt>Total</dt><dd>{money(totals.total, cur)}</dd></div>
      </dl>
      {shop.shop.orderNote ? <p className="muted">{shop.shop.orderNote}</p> : null}

      {!me ? (
        <p className="sf-hint">Crée un compte pour suivre tes commandes. <button type="button" className="sf-link" onClick={onNeedAccount}>Se connecter ou s'inscrire</button> — ou commande sans compte ci-dessous.</p>
      ) : null}

      <form onSubmit={(e) => void submit(e)} className="sf-form">
        <label>Nom<input required minLength={2} maxLength={80} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>Téléphone (WhatsApp si possible)<input required type="tel" inputMode="tel" autoComplete="tel" placeholder="237699112233" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
        <label>Adresse de livraison<textarea rows={2} maxLength={300} autoComplete="street-address" value={address} onChange={(e) => setAddress(e.target.value)} /></label>
        <label>Précision (facultatif)<input maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} /></label>

        <fieldset>
          <legend>Paiement</legend>
          {methods.map((m) => (
            <label key={m} className="sf-radio"><input type="radio" name="method" checked={method === m} onChange={() => setMethod(m)} />{m === "link" ? pay.linkLabel || METHOD_LABEL.link : METHOD_LABEL[m]}</label>
          ))}
          {method === "momo" ? (
            <div className="sf-momo">
              <p>Envoie <b>{money(totals.total, cur)}</b> à l'un de ces numéros, puis colle ici le numéro de la transaction :</p>
              <ul>{pay.momo.map((m, i) => <li key={i}><b>{m.operator}</b> {m.number}{m.holder ? ` (${m.holder})` : ""}</li>)}</ul>
              <label>Numéro de transaction<input required minLength={4} maxLength={60} value={ref} onChange={(e) => setRef(e.target.value)} /></label>
            </div>
          ) : null}
          {method === "link" ? <p className="muted">Tu seras redirigé vers la page de paiement après la commande.</p> : null}
        </fieldset>

        {belowMin ? <p className="sf-error" role="alert">Commande minimum : {money(shop.shop.minOrder, cur)}.</p> : null}
        {err ? <p className="sf-error" role="alert">{err}</p> : null}
        <button type="submit" className="sf-btn" disabled={busy || belowMin}>{busy ? "Envoi…" : `Commander · ${money(totals.total, cur)}`}</button>
      </form>
    </section>
  );
}

function Done({ shop, result, onBack }: { shop: PublicShop; result: OrderResult; onBack: () => void }) {
  const o = result.order;
  const wa = shop.shop.whatsapp
    ? waLink(shop.shop.whatsapp, `Bonjour, commande #${o.number} de ${o.name} : ${o.lines.map((l) => `${l.qty}× ${l.name}`).join(", ")}. Total ${money(o.total, o.currency)}.`)
    : "";
  return (
    <section className="wrap sf-pad sf-done">
      <div className="sf-check" aria-hidden="true">✓</div>
      <h2>Commande #{o.number} reçue</h2>
      <p>Merci {o.name} ! Total à régler : <b>{money(o.total, o.currency)}</b> ({METHOD_LABEL[o.method]}).</p>
      {o.method === "momo" ? <p className="muted">Nous vérifions ton paiement (réf. {o.paymentRef}) puis confirmons ta commande.</p> : null}
      {result.payment.payUrl ? <a className="sf-btn" href={result.payment.payUrl} rel="noopener">Payer maintenant</a> : null}
      {wa && wa !== "#" ? <a className="sf-btn alt" href={wa} rel="noopener">Prévenir la boutique sur WhatsApp</a> : null}
      <button type="button" className="sf-link" onClick={onBack}>Continuer mes achats</button>
    </section>
  );
}

function Account({ slug, me, orders, cur, onAuth, onLogout }: {
  slug: string; me: { name: string; phone: string } | null; orders: Order[]; cur: string; onAuth: (token: string) => void; onLogout: () => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  if (me) {
    return (
      <section className="wrap sf-pad" aria-label="Mon compte">
        <h2>Bonjour {me.name}</h2>
        <p className="muted">+{me.phone}</p>
        <h3>Mes commandes</h3>
        {orders.length === 0 ? <p className="muted">Aucune commande pour l'instant.</p> : (
          <ul className="sf-orders">
            {orders.map((o) => (
              <li key={o.id}>
                <div><strong>#{o.number}</strong> <time dateTime={new Date(o.createdAt).toISOString()}>{new Date(o.createdAt).toLocaleDateString("fr-FR")}</time><span className={`sf-pill s-${o.status}`}>{STATUS_LABEL[o.status]}</span></div>
                <small>{o.lines.map((l) => `${l.qty} × ${l.name}`).join(", ")}</small>
                <div><b>{money(o.total, cur)}</b> <span className="muted">{METHOD_LABEL[o.method]} · {PAYMENT_STATUS_LABEL[o.paymentStatus]}</span></div>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="sf-link" onClick={onLogout}>Se déconnecter</button>
      </section>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const r = mode === "login" ? await shopApi.login(slug, { phone, password }) : await shopApi.register(slug, { name, phone, password });
      onAuth(r.token);
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="wrap sf-pad" aria-label="Compte">
      <h2>{mode === "login" ? "Connexion" : "Créer mon compte"}</h2>
      <form onSubmit={(e) => void submit(e)} className="sf-form">
        {mode === "register" ? <label>Nom<input required minLength={2} maxLength={80} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></label> : null}
        <label>Téléphone<input required type="tel" inputMode="tel" autoComplete="tel" placeholder="237699112233" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
        <label>Mot de passe<input required type="password" minLength={mode === "register" ? 6 : 1} maxLength={100} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {err ? <p className="sf-error" role="alert">{err}</p> : null}
        <button type="submit" className="sf-btn" disabled={busy}>{busy ? "…" : mode === "login" ? "Me connecter" : "Créer mon compte"}</button>
      </form>
      <button type="button" className="sf-link" onClick={() => { setMode(mode === "login" ? "register" : "login"); setErr(""); }}>
        {mode === "login" ? "Pas de compte ? Inscris-toi" : "J'ai déjà un compte"}
      </button>
    </section>
  );
}
