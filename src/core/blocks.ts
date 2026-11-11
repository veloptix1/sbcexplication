import { Block, type BlockType } from "./schema.js";

type BlockInput = Parameters<typeof Block.parse>[0];

/** Crée un bloc valide (identifiant et valeurs par défaut compris). */
export const mk = (input: BlockInput): Block => Block.parse(input);

export interface BlockMeta {
  label: string;
  icon: string;
  hint: string;
  make: () => Block;
}

export const BLOCK_META: Record<BlockType, BlockMeta> = {
  hero: { label: "Bandeau d'accueil", icon: "▀", hint: "Titre, texte et bouton", make: () => mk({ type: "hero", title: "Ton titre ici", text: "Une phrase qui donne envie d'en savoir plus.", cta: "Nous contacter", link: "#contact" }) },
  heading: { label: "Titre de section", icon: "H", hint: "Un titre seul", make: () => mk({ type: "heading", text: "Nouveau titre" }) },
  text: { label: "Texte", icon: "¶", hint: "Un paragraphe", make: () => mk({ type: "text", text: "Écris ton texte ici." }) },
  image: { label: "Image", icon: "▣", hint: "Une photo à partir d'un lien", make: () => mk({ type: "image", url: "", alt: "", caption: "" }) },
  button: { label: "Bouton", icon: "◉", hint: "Un lien bien visible", make: () => mk({ type: "button", label: "Découvrir", link: "https://" }) },
  list: { label: "Liste de prix", icon: "☰", hint: "Produits, services, menu", make: () => mk({ type: "list", title: "Nos tarifs", items: [{ name: "Article", price: "5 000 FCFA", description: "" }] }) },
  features: { label: "Points forts", icon: "✦", hint: "Icône, titre et texte", make: () => mk({ type: "features", title: "Pourquoi nous choisir", items: [{ icon: "⚡", title: "Rapide", text: "Réponse en moins d'une heure." }] }) },
  testimonials: { label: "Avis clients", icon: "❝", hint: "Ce que disent tes clients", make: () => mk({ type: "testimonials", title: "Ils nous font confiance", items: [{ name: "Aïcha", role: "Cliente", text: "Service impeccable, je recommande." }] }) },
  faq: { label: "Questions fréquentes", icon: "?", hint: "Questions et réponses", make: () => mk({ type: "faq", title: "Questions fréquentes", items: [{ q: "Comment commander ?", a: "Écris-nous sur WhatsApp." }] }) },
  contact: { label: "Contact", icon: "✆", hint: "WhatsApp, téléphone, e-mail", make: () => mk({ type: "contact", title: "Contact", whatsapp: "", phone: "", email: "", address: "" }) },
  orderForm: { label: "Formulaire de commande", icon: "✉", hint: "Envoie la commande sur WhatsApp", make: () => mk({ type: "orderForm", title: "Passer commande", whatsapp: "", button: "Envoyer sur WhatsApp", fields: ["Nom", "Produit", "Détails"] }) },
  video: { label: "Vidéo", icon: "▶", hint: "YouTube ou Vimeo", make: () => mk({ type: "video", url: "" }) },
  footer: { label: "Pied de page", icon: "▁", hint: "Mentions et copyright", make: () => mk({ type: "footer", text: "© 2026 Ton nom" }) },
};

export const BLOCK_ORDER = Object.keys(BLOCK_META) as BlockType[];
