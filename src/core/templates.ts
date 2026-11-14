import { mk } from "./blocks.js";
import { AppProject, BotProject, PageProject, Product, SiteProject, type BotNode, type Project, type ProjectKind } from "./schema.js";
import { uid } from "./util.js";

export interface Template {
  id: string;
  kind: ProjectKind;
  name: string;
  blurb: string;
  accent: string;
  build: () => Project;
}

const WA = "237600000000";

const site = (name: string, accent: string, blocks: ReturnType<typeof mk>[], extra: Partial<SiteProject["settings"]> = {}): SiteProject =>
  SiteProject.parse({ kind: "site", name, settings: { title: name, accent, ...extra }, blocks });

const page = (name: string, accent: string, blocks: ReturnType<typeof mk>[], extra: Partial<PageProject["settings"]> = {}): PageProject =>
  PageProject.parse({ kind: "page", name, settings: { title: name, accent, ...extra }, blocks });

type ProductRow = [name: string, price: number, category: string, description: string, stock?: number];
const app = (name: string, accent: string, blocks: ReturnType<typeof mk>[], rows: ProductRow[], extra: Partial<AppProject["settings"]> = {}, shop: Partial<AppProject["shop"]> = {}): AppProject =>
  AppProject.parse({
    kind: "app", name,
    settings: { title: name, accent, ...extra },
    shop: { currency: "FCFA", deliveryFee: 1000, freeDeliveryFrom: 20000, orderNote: "Livraison en ville sous 24 h.", ...shop },
    payments: { cod: true },
    products: rows.map(([n, price, category, description, stock]) => Product.parse({ name: n, price, category, description, stock: stock ?? null })),
    blocks,
  });

/** Construit les nœuds d'un bot avec des identifiants lisibles : [clé, parent, étiquette, type, texte|url]. */
type Row = [key: string, parent: string, label: string, type: BotNode["type"], body: string];
const bot = (name: string, welcome: string, rows: Row[], columns: 1 | 2 = 1): BotProject => {
  const ids = new Map(rows.map(([key]) => [key, uid()]));
  return BotProject.parse({
    kind: "bot", name, welcome, columns,
    nodes: rows.map(([key, parent, label, type, body]) => ({
      id: ids.get(key), parent: parent === "root" ? "root" : ids.get(parent), label, type,
      text: type === "link" ? "" : body, url: type === "link" ? body : "",
    })),
  });
};

export const TEMPLATES: Template[] = [
  {
    id: "vitrine", kind: "site", name: "Vitrine d'entreprise", blurb: "Services, points forts, contact", accent: "#2f3fb8",
    build: () => site("Mon entreprise", "#2f3fb8", [
      mk({ type: "hero", title: "Des services fiables, près de chez toi", text: "Présente en deux phrases ce que tu fais et pour qui.", cta: "Demander un devis", link: `https://wa.me/${WA}` }),
      mk({ type: "features", title: "Pourquoi nous choisir", items: [
        { icon: "⚡", title: "Réactif", text: "Une réponse le jour même." },
        { icon: "✅", title: "Travail garanti", text: "Satisfait ou nous reprenons." },
        { icon: "💬", title: "À l'écoute", text: "On adapte l'offre à ton budget." } ] }),
      mk({ type: "list", title: "Nos services", items: [
        { name: "Service de base", price: "10 000 FCFA", description: "Ce qui est inclus, en une ligne." },
        { name: "Service complet", price: "25 000 FCFA", description: "Pour les besoins plus importants." } ] }),
      mk({ type: "testimonials", title: "Ils nous font confiance", items: [{ name: "Awa D.", role: "Cliente", text: "Rapide et sérieux. Je recommande sans hésiter." }] }),
      mk({ type: "contact", title: "Parlons de ton projet", whatsapp: WA, phone: `+${WA}`, email: "", address: "Douala, Cameroun" }),
      mk({ type: "footer", text: "© 2026 Mon entreprise" }),
    ], { whatsappFloat: WA, emoji: "🏢" }),
  },
  {
    id: "boutique", kind: "site", name: "Boutique en ligne", blurb: "Catalogue et commande WhatsApp", accent: "#c2410c",
    build: () => site("Ma boutique", "#c2410c", [
      mk({ type: "hero", title: "Ma boutique", text: "Des produits choisis avec soin, livrés chez toi.", cta: "Commander", link: "#orderForm" }),
      mk({ type: "list", title: "Nos produits", items: [
        { name: "Produit 1", price: "5 000 FCFA", description: "Description courte" },
        { name: "Produit 2", price: "8 500 FCFA", description: "Description courte" },
        { name: "Produit 3", price: "12 000 FCFA", description: "Description courte" } ] }),
      mk({ type: "features", title: "Livraison et paiement", items: [
        { icon: "🚚", title: "Livraison rapide", text: "En ville sous 24 h." },
        { icon: "📱", title: "Mobile Money", text: "Orange Money, MTN MoMo, Wave." } ] }),
      mk({ type: "orderForm", title: "Passer commande", whatsapp: WA, button: "Envoyer ma commande", fields: ["Nom", "Ville", "Produits souhaités"] }),
      mk({ type: "faq", title: "Questions fréquentes", items: [
        { q: "Comment payer ?", a: "À la livraison ou par Mobile Money." },
        { q: "Puis-je échanger un article ?", a: "Oui, sous 7 jours si l'article est intact." } ] }),
      mk({ type: "footer", text: "© 2026 Ma boutique" }),
    ], { whatsappFloat: WA, emoji: "🛍️" }),
  },
  {
    id: "restaurant", kind: "site", name: "Restaurant", blurb: "Menu, horaires, réservation", accent: "#a16207",
    build: () => site("Chez Mama", "#a16207", [
      mk({ type: "hero", title: "Chez Mama", text: "Cuisine maison, ingrédients du marché du matin.", cta: "Réserver une table", link: `https://wa.me/${WA}` }),
      mk({ type: "list", title: "Le menu du jour", items: [
        { name: "Poulet DG", price: "3 500 FCFA", description: "Plantains, légumes, poulet mariné" },
        { name: "Poisson braisé", price: "4 000 FCFA", description: "Bâton de manioc et piment" },
        { name: "Ndolé", price: "3 000 FCFA", description: "Crevettes, viande, plantain" } ] }),
      mk({ type: "text", text: "Ouvert du lundi au samedi, de 11 h à 22 h.\nLivraison dans un rayon de 5 km." }),
      mk({ type: "contact", title: "Réserver", whatsapp: WA, phone: `+${WA}`, email: "", address: "Rue principale, Douala" }),
      mk({ type: "footer", text: "© 2026 Chez Mama" }),
    ], { theme: "paper", font: "serif", whatsappFloat: WA, emoji: "🍲" }),
  },
  {
    id: "portfolio", kind: "site", name: "Portfolio freelance", blurb: "Présentation, offres, contact", accent: "#0f766e",
    build: () => site("Ton nom", "#0f766e", [
      mk({ type: "hero", title: "Je crée des sites qui font vendre", text: "Développeur freelance. Sites, applications et bots pour les entreprises africaines.", cta: "Me contacter", link: `https://wa.me/${WA}` }),
      mk({ type: "heading", text: "Ce que je fais" }),
      mk({ type: "features", title: "", items: [
        { icon: "🌐", title: "Sites web", text: "Rapides, adaptés au mobile." },
        { icon: "🤖", title: "Bots Telegram", text: "Pour vendre et répondre 24 h/24." },
        { icon: "💳", title: "Paiement mobile", text: "Intégration Mobile Money." } ] }),
      mk({ type: "list", title: "Tarifs indicatifs", items: [{ name: "Site vitrine", price: "dès 75 000 FCFA", description: "" }, { name: "Bot Telegram", price: "dès 50 000 FCFA", description: "" }] }),
      mk({ type: "contact", title: "Travaillons ensemble", whatsapp: WA, phone: "", email: "contact@exemple.com", address: "" }),
      mk({ type: "footer", text: "© 2026" }),
    ], { theme: "midnight", accent: "#2dd4bf", font: "rounded", emoji: "💻" }),
  },
  {
    id: "formation", kind: "site", name: "Formation en ligne", blurb: "Page de vente avec avis et FAQ", accent: "#7c3aed",
    build: () => site("Ma formation", "#7c3aed", [
      mk({ type: "hero", title: "Apprends un métier en 30 jours", text: "Une formation pratique, à ton rythme, avec un suivi sur WhatsApp.", cta: "Je m'inscris", link: "#orderForm" }),
      mk({ type: "features", title: "Ce que tu vas apprendre", items: [
        { icon: "🎯", title: "Des bases solides", text: "Les notions essentielles, sans jargon." },
        { icon: "🛠️", title: "Des projets réels", text: "Tu construis pendant que tu apprends." },
        { icon: "🤝", title: "Un suivi personnel", text: "Questions et corrections sur WhatsApp." } ] }),
      mk({ type: "video", url: "" }),
      mk({ type: "list", title: "Tarif", items: [{ name: "Accès complet", price: "25 000 FCFA", description: "Paiement en 2 fois possible" }] }),
      mk({ type: "testimonials", title: "Anciens élèves", items: [{ name: "Moussa K.", role: "Étudiant", text: "J'ai trouvé mon premier client après trois semaines." }] }),
      mk({ type: "orderForm", title: "Inscription", whatsapp: WA, button: "Réserver ma place", fields: ["Nom", "Pays", "Ton objectif"] }),
      mk({ type: "faq", title: "Questions fréquentes", items: [{ q: "Faut-il un ordinateur ?", a: "Un téléphone suffit pour commencer." }] }),
    ], { emoji: "🎓" }),
  },
  {
    id: "app-boutique", kind: "app", name: "Boutique avec commandes", blurb: "Panier, comptes clients, paiement, admin", accent: "#c2410c",
    build: () => app("Ma boutique", "#c2410c", [
      mk({ type: "hero", title: "Ma boutique", text: "Des produits choisis avec soin, livrés chez toi.", cta: "Voir la boutique", link: "#shop" }),
      mk({ type: "features", title: "Pourquoi commander ici", items: [
        { icon: "🚚", title: "Livraison rapide", text: "En ville sous 24 h." },
        { icon: "📱", title: "Paiement mobile", text: "Orange Money, MTN MoMo, Wave." },
        { icon: "🔁", title: "Échange facile", text: "Sous 7 jours si l'article est intact." } ] }),
      mk({ type: "faq", title: "Questions fréquentes", items: [
        { q: "Comment payer ?", a: "À la livraison ou par Mobile Money : choisis au moment de la commande." },
        { q: "Puis-je suivre ma commande ?", a: "Oui, depuis l'onglet Compte." } ] }),
    ], [
      ["T-shirt coton", 5000, "Vêtements", "Coton épais, tailles S à XL", 40],
      ["Pantalon chino", 12000, "Vêtements", "Coupe droite, 3 coloris", 25],
      ["Robe wax", 18000, "Vêtements", "Tissu wax, fait main", 10],
      ["Baskets blanches", 18000, "Chaussures", "Confortables, semelle souple", 15],
      ["Sandales cuir", 6000, "Chaussures", "Cuir véritable"],
      ["Sac à main", 9500, "Accessoires", "Deux compartiments, fermeture éclair"],
      ["Casquette", 3000, "Accessoires", "Taille unique, réglable"],
    ], { emoji: "🛍️" }),
  },
  {
    id: "app-restaurant", kind: "app", name: "Restaurant et livraison", blurb: "Menu, commande, suivi de livraison", accent: "#a16207",
    build: () => app("Chez Mama", "#a16207", [
      mk({ type: "hero", title: "Chez Mama", text: "Cuisine maison, livrée chaude. Commande en deux minutes.", cta: "Voir le menu", link: "#shop" }),
      mk({ type: "text", text: "Ouvert du lundi au samedi, de 11 h à 22 h.\nLivraison dans un rayon de 5 km." }),
      mk({ type: "faq", title: "Questions fréquentes", items: [{ q: "Quel délai de livraison ?", a: "Entre 30 et 45 minutes selon ta zone." }] }),
    ], [
      ["Poulet DG", 3500, "Plats", "Plantains, légumes, poulet mariné"],
      ["Poisson braisé", 4000, "Plats", "Bâton de manioc et piment"],
      ["Ndolé", 3000, "Plats", "Crevettes, viande, plantain"],
      ["Jus de bissap", 500, "Boissons", "Frais, maison", 60],
      ["Eau minérale", 300, "Boissons", "50 cl"],
      ["Beignets", 1000, "Desserts", "Portion de 6"],
    ], { theme: "paper", font: "serif", emoji: "🍲" }, { deliveryFee: 1000, freeDeliveryFrom: 10000, orderNote: "Livraison en 30 à 45 minutes." }),
  },
  {
    id: "lien-bio", kind: "page", name: "Page de liens", blurb: "Tous tes liens sur une page mobile", accent: "#db2777",
    build: () => page("Ton nom", "#db2777", [
      mk({ type: "hero", title: "Ton nom", text: "Ce que tu fais, en une ligne.", cta: "", link: "" }),
      mk({ type: "button", label: "💬 Écris-moi sur WhatsApp", link: `https://wa.me/${WA}`, style: "solid" }),
      mk({ type: "button", label: "📸 Instagram", link: "https://instagram.com/", style: "outline" }),
      mk({ type: "button", label: "🎵 TikTok", link: "https://tiktok.com/", style: "outline" }),
      mk({ type: "button", label: "🌐 Mon site", link: "https://", style: "outline" }),
      mk({ type: "footer", text: "Merci de ta visite" }),
    ], { emoji: "✨" }),
  },
  {
    id: "catalogue", kind: "page", name: "Catalogue mobile", blurb: "Prix et commande en un écran", accent: "#15803d",
    build: () => page("Mon catalogue", "#15803d", [
      mk({ type: "hero", title: "Mon catalogue", text: "Commande en deux minutes, livraison le jour même.", cta: "Commander", link: "#orderForm" }),
      mk({ type: "list", title: "Prix", items: [
        { name: "Article A", price: "2 000 FCFA", description: "" },
        { name: "Article B", price: "3 500 FCFA", description: "" },
        { name: "Article C", price: "6 000 FCFA", description: "" } ] }),
      mk({ type: "orderForm", title: "Commander", whatsapp: WA, button: "Envoyer sur WhatsApp", fields: ["Nom", "Quartier", "Ma commande"] }),
    ], { emoji: "📦", whatsappFloat: WA }),
  },
  {
    id: "bot-boutique", kind: "bot", name: "Bot boutique", blurb: "Catalogue, prix, commande", accent: "#2563eb",
    build: () => bot("Ma Boutique Bot", "👋 Bienvenue ! Que veux-tu voir ?", [
      ["cat", "root", "🛍️ Catalogue", "message", "Voici nos catégories :"],
      ["v", "cat", "Vêtements", "message", "👕 T-shirts : 5 000 FCFA\n👖 Pantalons : 12 000 FCFA\n\nPour commander, utilise « Passer commande »."],
      ["c", "cat", "Chaussures", "message", "👟 Baskets : 18 000 FCFA\n🩴 Sandales : 6 000 FCFA"],
      ["liv", "root", "🚚 Livraison", "message", "Livraison en ville sous 24 h. Gratuite dès 20 000 FCFA."],
      ["cmd", "root", "🧾 Passer commande", "ask", "Écris ta commande : articles, taille et quartier. On te répond vite."],
      ["wa", "root", "💬 WhatsApp", "link", `https://wa.me/${WA}`],
    ]),
  },
  {
    id: "bot-support", kind: "bot", name: "Bot FAQ et support", blurb: "Réponses automatiques et message à l'équipe", accent: "#0891b2",
    build: () => bot("Support Bot", "Bonjour ! Comment pouvons-nous t'aider ?", [
      ["f", "root", "❓ Questions fréquentes", "message", "Choisis ta question :"],
      ["f1", "f", "Quels sont vos horaires ?", "message", "Du lundi au samedi, de 8 h à 18 h."],
      ["f2", "f", "Comment payer ?", "message", "Mobile Money (Orange, MTN, Wave) ou espèces à la livraison."],
      ["f3", "f", "Où êtes-vous situés ?", "message", "Rue principale, Douala. Ouvert au public."],
      ["m", "root", "✉️ Écrire à l'équipe", "ask", "Décris ton problème en un message, on te répond dès que possible."],
      ["s", "root", "🌐 Notre site", "link", "https://exemple.com"],
    ]),
  },
  {
    id: "bot-restaurant", kind: "bot", name: "Bot restaurant", blurb: "Menu, horaires, réservation", accent: "#b45309",
    build: () => bot("Chez Mama Bot", "🍲 Bienvenue chez Mama !", [
      ["menu", "root", "📋 Menu du jour", "message", "🍗 Poulet DG : 3 500 FCFA\n🐟 Poisson braisé : 4 000 FCFA\n🥘 Ndolé : 3 000 FCFA"],
      ["h", "root", "🕒 Horaires", "message", "Lundi au samedi, 11 h à 22 h."],
      ["r", "root", "📅 Réserver une table", "ask", "Écris la date, l'heure et le nombre de personnes."],
      ["loc", "root", "📍 Nous trouver", "link", "https://maps.google.com"],
    ], 2),
  },
];

export const templatesFor = (kind: ProjectKind): Template[] => TEMPLATES.filter((t) => t.kind === kind);
export const findTemplate = (id: string): Template | undefined => TEMPLATES.find((t) => t.id === id);

/** Projet vide pour un type donné. */
export function blankProject(kind: ProjectKind): Project {
  if (kind === "app") return app("Ma boutique", "#4b3fd1", [mk({ type: "hero", title: "Ma boutique", text: "Bienvenue !", cta: "Voir la boutique", link: "#shop" })], [["Premier produit", 1000, "", "Décris ton produit"]]);
  if (kind === "bot") return bot("Mon bot", "👋 Bienvenue !", [["a", "root", "Premier bouton", "message", "Écris ici la réponse du bot."]]);
  const first = mk({ type: "hero", title: "Mon titre", text: "Une phrase d'accroche.", cta: "", link: "" });
  return kind === "page" ? page("Ma page", "#4b3fd1", [first]) : site("Mon site", "#4b3fd1", [first]);
}
