import type { Block, BlockType } from "../core/schema.js";
import { Select, TextArea, TextInput } from "./fields.js";

type Kind = "text" | "area" | "url" | "tel" | "email" | "lines" | "select";
interface F {
  k: string;
  label: string;
  as?: Kind;
  ph?: string;
  hint?: string;
  max?: number;
  options?: readonly (readonly [string, string])[];
}
interface ItemsF {
  k: string;
  label: string;
  as: "items";
  fields: F[];
  blank: Record<string, string>;
  noun: string;
  article: "un" | "une";
  title: (item: Record<string, string>) => string;
}
type Spec = (F | ItemsF)[];

const LINK = "Une adresse web, un lien WhatsApp (https://wa.me/237…), ou #contact pour aller à la section Contact.";

export const SPECS: Record<BlockType, Spec> = {
  hero: [
    { k: "title", label: "Titre", max: 160 },
    { k: "text", label: "Texte", as: "area", max: 500 },
    { k: "cta", label: "Texte du bouton", hint: "Laisse vide pour masquer le bouton.", max: 50 },
    { k: "link", label: "Lien du bouton", as: "url", hint: LINK, ph: "#contact" },
    { k: "image", label: "Image de fond (lien)", as: "url", hint: "Colle l'adresse d'une photo en ligne. Laisse vide pour une couleur unie.", ph: "https://…" },
  ],
  heading: [{ k: "text", label: "Titre", max: 160 }],
  text: [{ k: "text", label: "Texte", as: "area", max: 2000 }],
  image: [
    { k: "url", label: "Adresse de l'image", as: "url", ph: "https://…", hint: "Sans adresse, le bloc n'apparaît pas dans la page." },
    { k: "alt", label: "Description (pour les non-voyants)", max: 160 },
    { k: "caption", label: "Légende", max: 200 },
  ],
  button: [
    { k: "label", label: "Texte du bouton", max: 60 },
    { k: "link", label: "Lien", as: "url", hint: LINK },
    { k: "style", label: "Style", as: "select", options: [["solid", "Plein"], ["outline", "Contour"]] },
  ],
  list: [
    { k: "title", label: "Titre de la liste", max: 120 },
    { k: "items", label: "Lignes", as: "items", noun: "ligne", article: "une", blank: { name: "", price: "", description: "" }, title: (i) => i.name || "Sans nom",
      fields: [{ k: "name", label: "Nom", max: 120 }, { k: "price", label: "Prix", ph: "5 000 FCFA", max: 60 }, { k: "description", label: "Détail", max: 300 }] },
  ],
  features: [
    { k: "title", label: "Titre", max: 120 },
    { k: "items", label: "Points forts", as: "items", noun: "point fort", article: "un", blank: { icon: "✨", title: "", text: "" }, title: (i) => `${i.icon ?? ""} ${i.title || "Sans titre"}`,
      fields: [{ k: "icon", label: "Emoji", max: 8 }, { k: "title", label: "Titre", max: 80 }, { k: "text", label: "Texte", as: "area", max: 300 }] },
  ],
  testimonials: [
    { k: "title", label: "Titre", max: 120 },
    { k: "items", label: "Avis", as: "items", noun: "avis", article: "un", blank: { name: "", role: "", text: "" }, title: (i) => i.name || "Sans nom",
      fields: [{ k: "name", label: "Nom", max: 80 }, { k: "role", label: "Rôle", max: 80 }, { k: "text", label: "Avis", as: "area", max: 400 }] },
  ],
  faq: [
    { k: "title", label: "Titre", max: 120 },
    { k: "items", label: "Questions", as: "items", noun: "question", article: "une", blank: { q: "", a: "" }, title: (i) => i.q || "Sans question",
      fields: [{ k: "q", label: "Question", max: 200 }, { k: "a", label: "Réponse", as: "area", max: 800 }] },
  ],
  contact: [
    { k: "title", label: "Titre", max: 120 },
    { k: "whatsapp", label: "WhatsApp", as: "tel", ph: "237600000000", hint: "Avec l'indicatif du pays, sans + ni espaces." },
    { k: "phone", label: "Téléphone", as: "tel", ph: "+237 600 00 00 00" },
    { k: "email", label: "E-mail", as: "email" },
    { k: "address", label: "Adresse et horaires", as: "area", max: 200 },
  ],
  orderForm: [
    { k: "title", label: "Titre", max: 120 },
    { k: "whatsapp", label: "WhatsApp qui reçoit la commande", as: "tel", ph: "237600000000", hint: "Avec l'indicatif du pays. Sans numéro, le formulaire ne peut pas envoyer." },
    { k: "fields", label: "Champs (un par ligne)", as: "lines", hint: "Le dernier champ est une zone de texte plus grande." },
    { k: "button", label: "Texte du bouton", max: 60 },
  ],
  video: [{ k: "url", label: "Lien YouTube ou Vimeo", as: "url", ph: "https://youtube.com/watch?v=…", hint: "Sans lien valide, le bloc n'apparaît pas dans la page." }],
  footer: [{ k: "text", label: "Texte", as: "area", max: 300 }],
};

type Rec = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === "string" ? v : "");

function renderField(f: F, value: unknown, set: (v: unknown) => void) {
  switch (f.as) {
    case "area":
      return <TextArea key={f.k} label={f.label} hint={f.hint} value={str(value)} max={f.max} placeholder={f.ph} onChange={set} />;
    case "lines":
      return <TextArea key={f.k} label={f.label} hint={f.hint} rows={5} value={Array.isArray(value) ? value.join("\n") : ""} onChange={(v) => set(v.split("\n"))} />;
    case "select":
      return <Select key={f.k} label={f.label} hint={f.hint} value={str(value)} options={f.options ?? []} onChange={set} />;
    default:
      return <TextInput key={f.k} label={f.label} hint={f.hint} type={f.as === "url" || f.as === "tel" || f.as === "email" ? f.as : "text"} value={str(value)} max={f.max} placeholder={f.ph} onChange={set} />;
  }
}

function ItemsEditor({ spec, items, onChange }: { spec: ItemsF; items: Record<string, string>[]; onChange: (items: Record<string, string>[]) => void }) {
  const patch = (i: number, k: string, v: string) => onChange(items.map((it, n) => (n === i ? { ...it, [k]: v } : it)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  };
  return (
    <div className="items">
      <span className="label">{spec.label}</span>
      {items.length === 0 ? <p className="hint">Aucun élément pour l'instant.</p> : null}
      {items.map((it, i) => (
        <fieldset key={i} className="item">
          <legend>{spec.title(it)}</legend>
          {spec.fields.map((f) => renderField(f, it[f.k], (v) => patch(i, f.k, String(v))))}
          <div className="row-actions">
            <button type="button" className="mini" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Monter">↑</button>
            <button type="button" className="mini" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label="Descendre">↓</button>
            <button type="button" className="mini danger" onClick={() => onChange(items.filter((_, n) => n !== i))}>Supprimer</button>
          </div>
        </fieldset>
      ))}
      <button type="button" className="btn ghost" onClick={() => onChange([...items, { ...spec.blank }])}>
        + Ajouter {spec.article} {spec.noun}
      </button>
    </div>
  );
}

export function BlockForm({ block, onChange }: { block: Block; onChange: (patch: Rec, key: string) => void }) {
  const data = block as unknown as Rec;
  return (
    <>
      {SPECS[block.type].map((f) =>
        f.as === "items" ? (
          <ItemsEditor key={f.k} spec={f} items={(data[f.k] as Record<string, string>[]) ?? []} onChange={(items) => onChange({ [f.k]: items }, "")} />
        ) : (
          renderField(f, data[f.k], (v) => onChange({ [f.k]: v }, `${block.id}:${f.k}`))
        ),
      )}
    </>
  );
}

/** Résumé d'une ligne pour la liste des blocs. */
export function blockSummary(b: Block): string {
  const clip = (s: string) => (s.length > 44 ? `${s.slice(0, 44)}…` : s);
  switch (b.type) {
    case "hero": return clip(b.title);
    case "heading": case "text": case "footer": return clip(b.text);
    case "image": return b.url ? clip(b.url.replace(/^https?:\/\//, "")) : "Pas d'image";
    case "button": return clip(b.label);
    case "list": case "features": case "testimonials": case "faq": return `${b.title ? `${clip(b.title)} · ` : ""}${b.items.length} élément${b.items.length > 1 ? "s" : ""}`;
    case "contact": return clip(b.title);
    case "orderForm": return clip(b.title);
    case "video": return b.url ? clip(b.url.replace(/^https?:\/\//, "")) : "Pas de lien";
  }
}
