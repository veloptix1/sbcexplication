import { useId, useState, type Dispatch } from "react";
import { money } from "../core/app-model.js";
import type { AppProject, MomoAccount, Product } from "../core/schema.js";
import { uid } from "../core/util.js";
import { Toggle, TextArea, TextInput } from "./fields.js";
import { appEdit, type Action } from "./store.js";

interface Props {
  project: AppProject;
  dispatch: Dispatch<Action>;
}

const edit = (dispatch: Dispatch<Action>, fn: (p: AppProject) => AppProject, key?: string) => dispatch({ type: "edit", fn: appEdit(fn), ...(key ? { key } : {}), now: Date.now() });

function NumberInput({ label, hint, value, onChange, min = 0, step = 1, allowEmpty = false }: { label: string; hint?: string; value: number | null; onChange: (v: number | null) => void; min?: number; step?: number; allowEmpty?: boolean }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="number" inputMode="decimal" min={min} step={step} value={value ?? ""} placeholder={allowEmpty ? "Illimité" : "0"}
        onChange={(e) => {
          const t = e.target.value;
          if (t === "") return onChange(allowEmpty ? null : 0);
          const n = Number(t);
          if (Number.isFinite(n) && n >= min) onChange(n);
        }} />
      {hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

/* ---------------- Catalogue ---------------- */

export function CatalogEditor({ project, dispatch }: Props) {
  const [sel, setSel] = useState<string | null>(null);
  const [bulk, setBulk] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const cur = project.shop.currency;
  const selected = project.products.find((p) => p.id === sel) ?? null;
  const patch = (id: string, change: Partial<Product>, key?: string) => edit(dispatch, (p) => ({ ...p, products: p.products.map((x) => (x.id === id ? { ...x, ...change } : x)) }), key ? `prod:${id}:${key}` : undefined);

  const add = () => {
    const id = uid();
    edit(dispatch, (p) => ({ ...p, products: [...p.products, { id, name: "Nouveau produit", price: 0, description: "", image: "", category: p.products.at(-1)?.category ?? "", stock: null, active: true }] }));
    setSel(id);
  };
  const remove = (id: string) => {
    edit(dispatch, (p) => ({ ...p, products: p.products.filter((x) => x.id !== id) }));
    if (sel === id) setSel(null);
  };
  const duplicate = (id: string) => {
    const copy = uid();
    edit(dispatch, (p) => {
      const i = p.products.findIndex((x) => x.id === id);
      const src = p.products[i];
      return src ? { ...p, products: [...p.products.slice(0, i + 1), { ...src, id: copy, name: `${src.name} (copie)` }, ...p.products.slice(i + 1)] } : p;
    });
    setSel(copy);
  };
  const importBulk = () => {
    // Une ligne par produit : « Nom ; prix ; catégorie ; description ». Le séparateur peut être ; ou tabulation.
    const rows = bulkText.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 300).map((l) => l.split(/[;\t]/).map((c) => c.trim()));
    const added: Product[] = rows.flatMap(([name = "", price = "", category = "", description = ""]) => {
      const n = Number(price.replace(/\s/g, "").replace(",", "."));
      return name && Number.isFinite(n) && n >= 0 ? [{ id: uid(), name: name.slice(0, 120), price: n, category: category.slice(0, 60), description: description.slice(0, 400), image: "", stock: null, active: true }] : [];
    });
    if (added.length) edit(dispatch, (p) => ({ ...p, products: [...p.products, ...added].slice(0, 300) }));
    setBulk(false);
    setBulkText("");
  };

  return (
    <div className="panels">
      <section className="pane" aria-label="Produits">
        <div className="pane-head"><h2>Produits <span className="count">{project.products.length}</span></h2></div>
        <div className="row-actions">
          <button type="button" className="btn solid" onClick={add}>+ Ajouter un produit</button>
          <button type="button" className="mini" onClick={() => setBulk(!bulk)}>Importer une liste</button>
        </div>
        {bulk ? (
          <div className="bulk">
            <TextArea label="Une ligne par produit" hint="Nom ; prix ; catégorie ; description. Tu peux coller depuis un tableur." rows={6} value={bulkText} onChange={setBulkText} placeholder={"T-shirt ; 5000 ; Vêtements ; Coton\nCasquette ; 3000 ; Accessoires"} />
            <button type="button" className="btn solid" onClick={importBulk} disabled={!bulkText.trim()}>Ajouter ces produits</button>
          </div>
        ) : null}
        {project.products.length === 0 ? <p className="empty small">Aucun produit. Ajoute le premier : sans produit, la boutique reste vide.</p> : null}
        <ul className="prodlist">
          {project.products.map((p) => (
            <li key={p.id} className={`${p.id === sel ? "on" : ""} ${p.active ? "" : "off"}`}>
              <button type="button" className="block-main" aria-current={p.id === sel} onClick={() => setSel(p.id)}>
                <span className="block-ico" aria-hidden="true">{p.image ? "🖼️" : "📦"}</span>
                <span className="block-text"><strong>{p.name || "Sans nom"}</strong><small>{money(p.price, cur)}{p.category ? ` · ${p.category}` : ""}{p.stock !== null ? ` · stock ${p.stock}` : ""}{p.active ? "" : " · masqué"}</small></span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="pane" aria-label="Fiche produit">
        {selected ? (
          <>
            <div className="pane-head"><h2>Fiche produit</h2><button type="button" className="mini" onClick={() => setSel(null)}>Fermer</button></div>
            <TextInput label="Nom" value={selected.name} max={120} onChange={(v) => patch(selected.id, { name: v }, "name")} />
            <NumberInput label={`Prix (${cur})`} value={selected.price} step={0.01} onChange={(v) => patch(selected.id, { price: v ?? 0 }, "price")} />
            <TextInput label="Catégorie" hint="Les clients filtrent la boutique par catégorie." value={selected.category} max={60} onChange={(v) => patch(selected.id, { category: v }, "cat")} />
            <TextArea label="Description" rows={3} value={selected.description} max={400} onChange={(v) => patch(selected.id, { description: v }, "desc")} />
            <TextInput label="Photo (adresse https)" hint="Colle le lien d'une image hébergée (Supabase Storage, Imgur, ton site…)." type="url" value={selected.image} max={500} onChange={(v) => patch(selected.id, { image: v }, "img")} />
            <NumberInput label="Stock" hint="Laisse vide pour un stock illimité. Le stock baisse à chaque commande." value={selected.stock} allowEmpty onChange={(v) => patch(selected.id, { stock: v === null ? null : Math.floor(v) }, "stock")} />
            <Toggle label="Visible dans la boutique" checked={selected.active} onChange={(v) => patch(selected.id, { active: v })} />
            <div className="row-actions">
              <button type="button" className="mini" onClick={() => duplicate(selected.id)}>Dupliquer</button>
              <button type="button" className="mini danger" onClick={() => remove(selected.id)}>Supprimer</button>
            </div>
          </>
        ) : <p className="empty small">Choisis un produit pour le modifier.</p>}
      </section>
    </div>
  );
}

/* ---------------- Réglages de la boutique ---------------- */

export function ShopSettings({ project, dispatch }: Props) {
  const s = project.shop;
  const pay = project.payments;
  const setShop = (c: Partial<AppProject["shop"]>, key?: string) => edit(dispatch, (p) => ({ ...p, shop: { ...p.shop, ...c } }), key ? `shop:${key}` : undefined);
  const setPay = (c: Partial<AppProject["payments"]>, key?: string) => edit(dispatch, (p) => ({ ...p, payments: { ...p.payments, ...c } }), key ? `pay:${key}` : undefined);
  const setMomo = (i: number, c: Partial<MomoAccount>, key: string) => setPay({ momo: pay.momo.map((m, j) => (j === i ? { ...m, ...c } : m)) }, `momo${i}${key}`);

  return (
    <div className="panels single">
      <section className="pane" aria-label="Livraison">
        <div className="pane-head"><h2>Vente et livraison</h2></div>
        <TextInput label="Devise" hint="Ex : FCFA, XOF, NGN, USD." value={s.currency} max={10} onChange={(v) => setShop({ currency: v }, "cur")} />
        <NumberInput label="Frais de livraison" value={s.deliveryFee} onChange={(v) => setShop({ deliveryFee: v ?? 0 }, "fee")} />
        <NumberInput label="Livraison offerte à partir de" hint="0 = jamais offerte." value={s.freeDeliveryFrom} onChange={(v) => setShop({ freeDeliveryFrom: v ?? 0 }, "free")} />
        <NumberInput label="Commande minimum" hint="0 = pas de minimum." value={s.minOrder} onChange={(v) => setShop({ minOrder: v ?? 0 }, "min")} />
        <TextInput label="WhatsApp de la boutique" hint="Avec l'indicatif (237699112233). Le client peut te prévenir après sa commande." type="tel" value={s.whatsapp} max={30} onChange={(v) => setShop({ whatsapp: v }, "wa")} />
        <TextArea label="Message sur la livraison" rows={2} value={s.orderNote} max={300} onChange={(v) => setShop({ orderNote: v }, "note")} />
      </section>

      <section className="pane" aria-label="Paiement">
        <div className="pane-head"><h2>Paiement</h2></div>
        <Toggle label="Paiement à la livraison" checked={pay.cod} onChange={(v) => setPay({ cod: v })} />
        <p className="hint">Mobile Money : le client envoie l'argent à ton numéro puis saisit le numéro de transaction. Tu vérifies et valides dans l'administration.</p>
        {pay.momo.map((m, i) => (
          <fieldset key={i} className="momo">
            <legend>Compte {i + 1}</legend>
            <TextInput label="Opérateur" placeholder="Orange Money, MTN MoMo, Wave…" value={m.operator} max={40} onChange={(v) => setMomo(i, { operator: v }, "op")} />
            <TextInput label="Numéro" type="tel" value={m.number} max={30} onChange={(v) => setMomo(i, { number: v }, "num")} />
            <TextInput label="Nom du titulaire" value={m.holder} max={80} onChange={(v) => setMomo(i, { holder: v }, "holder")} />
            <button type="button" className="mini danger" onClick={() => setPay({ momo: pay.momo.filter((_, j) => j !== i) })}>Retirer ce compte</button>
          </fieldset>
        ))}
        {pay.momo.length < 6 ? <button type="button" className="mini" onClick={() => setPay({ momo: [...pay.momo, { operator: "", number: "", holder: "" }] })}>+ Ajouter un compte Mobile Money</button> : null}
        <TextInput label="Lien de paiement en ligne (facultatif)" hint="Lien https de ton agrégateur (CinetPay, FlinPay, PayDunya…). {amount} et {order} sont remplacés par le montant et le numéro de commande." type="url" value={pay.linkUrl} max={300} onChange={(v) => setPay({ linkUrl: v }, "link")} />
        {pay.linkUrl ? <TextInput label="Texte du bouton" value={pay.linkLabel} max={40} placeholder="Payer en ligne" onChange={(v) => setPay({ linkLabel: v }, "linkl")} /> : null}
      </section>

      <section className="pane" aria-label="Alertes">
        <div className="pane-head"><h2>Alertes Telegram</h2></div>
        <p className="hint">Reçois chaque nouvelle commande sur Telegram. Crée un bot avec @BotFather pour obtenir le jeton, puis écris à ton bot et lis ton identifiant avec @userinfobot. Le jeton reste sur le serveur, jamais visible des clients.</p>
        <TextInput label="Jeton du bot" value={project.notify.telegramBotToken} max={120} onChange={(v) => edit(dispatch, (p) => ({ ...p, notify: { ...p.notify, telegramBotToken: v.trim() } }), "tg-token")} />
        <TextInput label="Ton identifiant Telegram" value={project.notify.telegramChatId} max={40} onChange={(v) => edit(dispatch, (p) => ({ ...p, notify: { ...p.notify, telegramChatId: v.trim() } }), "tg-chat")} />
      </section>
    </div>
  );
}
