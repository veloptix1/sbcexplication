import { useCallback, useEffect, useRef, useState } from "react";
import { METHOD_LABEL, NEXT_STATUS, ORDER_STATUSES, PAYMENT_STATUS_LABEL, STATUS_LABEL, money, type Customer, type Order, type OrderStatus } from "../core/app-model.js";
import type { Product } from "../core/schema.js";
import { waLink } from "../core/util.js";
import { ApiError, adminApi, storage, type Stats } from "./api.js";

type Tab = "orders" | "products" | "stats" | "customers";
const keyName = (slug: string) => `af:admin:${slug}`;

export function Admin({ slug }: { slug: string }) {
  const [key, setKey] = useState(() => {
    // La clé peut arriver dans l'adresse (#key=…) : on la retient puis on l'efface de la barre d'adresse.
    const m = /[#&]key=([^&]+)/.exec(location.hash);
    if (m?.[1]) {
      const k = decodeURIComponent(m[1]);
      storage.set(keyName(slug), k);
      history.replaceState(null, "", location.pathname);
      return k;
    }
    return storage.get(keyName(slug));
  });
  const [name, setName] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    document.title = "Administration";
    if (!key) return;
    adminApi(slug, key).ping().then((r) => { setName(r.name); setErr(""); }, (e: unknown) => {
      if (e instanceof ApiError && (e.status === 401 || e.status === 404)) { storage.set(keyName(slug), ""); setKey(""); }
      setErr(e instanceof Error ? e.message : "Erreur");
    });
  }, [key, slug]);

  if (!key) return <Login onKey={(k) => { storage.set(keyName(slug), k); setKey(k); }} error={err} />;
  if (!name) return <div className="ad-center" role="status">{err || "Connexion…"}</div>;
  return <Dashboard slug={slug} adminKey={key} name={name} onLogout={() => { storage.set(keyName(slug), ""); setKey(""); setName(""); }} />;
}

function Login({ onKey, error }: { onKey: (k: string) => void; error: string }) {
  const [v, setV] = useState("");
  return (
    <form className="ad-center ad-login" onSubmit={(e) => { e.preventDefault(); if (v.trim()) onKey(v.trim()); }}>
      <h1>Administration</h1>
      <p>Colle ta clé d'administration. Elle t'a été montrée une seule fois à la publication.</p>
      <label>Clé<input autoFocus autoComplete="off" spellCheck={false} value={v} onChange={(e) => setV(e.target.value)} placeholder="af_…" /></label>
      {error ? <p className="sf-error" role="alert">{error}</p> : null}
      <button type="submit" className="sf-btn">Entrer</button>
    </form>
  );
}

function Dashboard({ slug, adminKey, name, onLogout }: { slug: string; adminKey: string; name: string; onLogout: () => void }) {
  const api = useRef(adminApi(slug, adminKey)).current;
  const [tab, setTab] = useState<Tab>("orders");
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [currency, setCurrency] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [msg, setMsg] = useState("");
  const knownNew = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [o, s] = await Promise.all([api.orders(), api.stats()]);
      setOrders(o.orders); setProducts(o.products); setCurrency(o.currency); setStats(s);
      if (knownNew.current !== null && s.toNotify > knownNew.current) setMsg("Nouvelle commande reçue !");
      knownNew.current = s.toNotify;
      document.title = s.toNotify ? `(${s.toNotify}) Administration` : "Administration";
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onLogout();
    }
  }, [api, onLogout]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => { if (!document.hidden) void refresh(); }, 20_000);
    return () => clearInterval(t);
  }, [refresh]);
  useEffect(() => { if (tab === "customers") api.customers().then((r) => setCustomers(r.customers), () => undefined); }, [tab, api]);
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(""), 3000); return () => clearTimeout(t); }, [msg]);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); setMsg(ok); await refresh(); } catch (e) { setMsg(e instanceof Error ? e.message : "Erreur"); }
  };

  const downloadCsv = async () => {
    try {
      const blob = await api.csv();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `commandes-${slug}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (e) { setMsg(e instanceof Error ? e.message : "Erreur"); }
  };

  const tabs: [Tab, string][] = [["orders", stats?.toNotify ? `Commandes (${stats.toNotify})` : "Commandes"], ["products", "Produits"], ["stats", "Chiffres"], ["customers", "Clients"]];
  return (
    <div className="ad">
      <header className="ad-top">
        <div><strong>{name}</strong><small>Administration</small></div>
        <a className="ad-view" href={`/a/${slug}`} target="_blank" rel="noopener">Voir la boutique ↗</a>
        <button type="button" className="sf-link" onClick={onLogout}>Quitter</button>
      </header>
      <nav className="ad-tabs" aria-label="Sections">
        {tabs.map(([t, label]) => <button key={t} type="button" aria-pressed={tab === t} onClick={() => setTab(t)}>{label}</button>)}
      </nav>
      {msg ? <div className="sf-toast" role="status">{msg}</div> : null}

      <main className="ad-main">
        {tab === "orders" && <Orders orders={orders} onPatch={(id, body, ok) => void act(() => api.patchOrder(id, body), ok)} onCsv={() => void downloadCsv()} />}
        {tab === "products" && <Products products={products} currency={currency} onPatch={(id, body) => void act(() => api.patchProduct(id, body), "Enregistré.")} />}
        {tab === "stats" && stats && <StatsView stats={stats} currency={currency} />}
        {tab === "customers" && (
          customers.length === 0 ? <p className="muted">Aucun client inscrit.</p> : (
            <ul className="ad-list">{customers.map((c) => <li key={c.id}><strong>{c.name}</strong><span>+{c.phone}</span><a href={waLink(c.phone)} rel="noopener">WhatsApp</a></li>)}</ul>
          )
        )}
      </main>
    </div>
  );
}

function Orders({ orders, onPatch, onCsv }: { orders: Order[]; onPatch: (id: string, body: { status?: string; paymentStatus?: string }, ok: string) => void; onCsv: () => void }) {
  const [filter, setFilter] = useState<OrderStatus | "open" | "all">("open");
  const shown = orders.filter((o) => (filter === "all" ? true : filter === "open" ? o.status !== "done" && o.status !== "cancelled" : o.status === filter));
  return (
    <>
      <div className="ad-bar">
        <label>Afficher
          <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
            <option value="open">À traiter</option>
            <option value="all">Toutes</option>
            {ORDER_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </label>
        <button type="button" className="sf-btn small alt" onClick={onCsv}>Exporter (CSV)</button>
      </div>
      {shown.length === 0 ? <p className="muted">Aucune commande dans cette liste.</p> : (
        <ul className="ad-orders">
          {shown.map((o) => {
            const next = NEXT_STATUS[o.status];
            return (
              <li key={o.id} className={`st-${o.status}`}>
                <div className="ad-ohead">
                  <strong>#{o.number}</strong>
                  <span className={`sf-pill s-${o.status}`}>{STATUS_LABEL[o.status]}</span>
                  <time dateTime={new Date(o.createdAt).toISOString()}>{new Date(o.createdAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</time>
                </div>
                <p className="ad-cust"><b>{o.name}</b> · <a href={`tel:+${o.phone}`}>+{o.phone}</a> · <a href={waLink(o.phone)} rel="noopener">WhatsApp</a></p>
                {o.address ? <p className="muted">📍 {o.address}</p> : null}
                {o.note ? <p className="muted">💬 {o.note}</p> : null}
                <ul className="ad-lines">{o.lines.map((l, i) => <li key={i}>{l.qty} × {l.name}<span>{money(l.qty * l.price, o.currency)}</span></li>)}</ul>
                <p className="ad-total">Total <b>{money(o.total, o.currency)}</b>{o.deliveryFee ? <small> (dont livraison {money(o.deliveryFee, o.currency)})</small> : null}</p>
                <p className="ad-pay">{METHOD_LABEL[o.method]} · <span className={`sf-pill p-${o.paymentStatus}`}>{PAYMENT_STATUS_LABEL[o.paymentStatus]}</span>{o.paymentRef ? <> · réf. <code>{o.paymentRef}</code></> : null}</p>
                <div className="ad-actions">
                  {o.paymentStatus !== "paid" && o.status !== "cancelled" ? <button type="button" className="sf-btn small" onClick={() => onPatch(o.id, { paymentStatus: "paid" }, "Paiement validé.")}>Paiement reçu</button> : null}
                  {next ? <button type="button" className="sf-btn small alt" onClick={() => onPatch(o.id, { status: next }, `Commande #${o.number} : ${STATUS_LABEL[next]}.`)}>→ {STATUS_LABEL[next]}</button> : null}
                  {o.status !== "cancelled" && o.status !== "done" ? <button type="button" className="sf-btn small danger" onClick={() => { if (window.confirm(`Annuler la commande #${o.number} ? Les articles seront remis en stock.`)) onPatch(o.id, { status: "cancelled" }, "Commande annulée."); }}>Annuler</button> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function Products({ products, currency, onPatch }: { products: Product[]; currency: string; onPatch: (id: string, body: { active?: boolean; stock?: number | null }) => void }) {
  if (products.length === 0) return <p className="muted">Aucun produit. Ajoute-en depuis l'éditeur, puis republie.</p>;
  return (
    <>
      <p className="muted">Ici tu changes la disponibilité et le stock en direct. Pour modifier noms, prix et photos, utilise l'éditeur puis republie.</p>
      <ul className="ad-list ad-prod">
        {products.map((p) => <ProductRow key={p.id} p={p} currency={currency} onPatch={onPatch} />)}
      </ul>
    </>
  );
}

function ProductRow({ p, currency, onPatch }: { p: Product; currency: string; onPatch: (id: string, body: { active?: boolean; stock?: number | null }) => void }) {
  const [stock, setStock] = useState(p.stock === null ? "" : String(p.stock));
  useEffect(() => setStock(p.stock === null ? "" : String(p.stock)), [p.stock]);
  const commit = () => {
    const next = stock.trim() === "" ? null : Number.parseInt(stock, 10);
    if (next !== null && (!Number.isInteger(next) || next < 0)) { setStock(p.stock === null ? "" : String(p.stock)); return; }
    if (next !== p.stock) onPatch(p.id, { stock: next });
  };
  return (
    <li className={p.active ? "" : "off"}>
      <span><strong>{p.name}</strong><small>{money(p.price, currency)}</small></span>
      <label className="ad-stock">Stock<input inputMode="numeric" placeholder="∞" value={stock} onChange={(e) => setStock(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} /></label>
      <button type="button" className={`sf-btn small ${p.active ? "alt" : ""}`} onClick={() => onPatch(p.id, { active: !p.active })}>{p.active ? "Masquer" : "Afficher"}</button>
    </li>
  );
}

function StatsView({ stats, currency }: { stats: Stats; currency: string }) {
  const cards: [string, string, string][] = [
    ["Aujourd'hui", money(stats.today.revenue, currency), `${stats.today.count} commande${stats.today.count > 1 ? "s" : ""}`],
    ["7 derniers jours", money(stats.week.revenue, currency), `${stats.week.count} commande${stats.week.count > 1 ? "s" : ""}`],
    ["Depuis le début", money(stats.all.revenue, currency), `${stats.all.count} commande${stats.all.count > 1 ? "s" : ""}`],
  ];
  return (
    <>
      <ul className="ad-cards">{cards.map(([t, v, s]) => <li key={t}><small>{t}</small><b>{v}</b><span>{s}</span></li>)}</ul>
      <p className="muted">{stats.toNotify} nouvelle{stats.toNotify > 1 ? "s" : ""} à traiter · {stats.toVerify} paiement{stats.toVerify > 1 ? "s" : ""} à vérifier. Les commandes annulées ne comptent pas.</p>
      <h3>Produits les plus vendus</h3>
      {stats.top.length === 0 ? <p className="muted">Pas encore de ventes.</p> : (
        <ul className="ad-list">{stats.top.map((t) => <li key={t.name}><strong>{t.name}</strong><span>{t.qty} vendu{t.qty > 1 ? "s" : ""}</span><b>{money(t.revenue, currency)}</b></li>)}</ul>
      )}
    </>
  );
}
