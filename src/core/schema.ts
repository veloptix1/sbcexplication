import { z } from "zod";
import { uid } from "./util.js";

/** Chaîne bornée, vide par défaut. */
const S = (max = 500) => z.string().max(max).default("");
const id = () => z.string().min(1).max(40).default(() => uid());

/* ------------------------------------------------------------------ */
/* Blocs de page                                                        */
/* ------------------------------------------------------------------ */

const PriceItem = z.object({ name: S(120), price: S(60), description: S(300) });
const FeatureItem = z.object({ icon: S(8), title: S(80), text: S(300) });
const Testimonial = z.object({ name: S(80), role: S(80), text: S(400) });
const FaqItem = z.object({ q: S(200), a: S(800) });

export const HeroBlock = z.object({
  id: id(), type: z.literal("hero"),
  title: S(160), text: S(500), cta: S(50), link: S(300), image: S(500),
});
export const HeadingBlock = z.object({ id: id(), type: z.literal("heading"), text: S(160) });
export const TextBlock = z.object({ id: id(), type: z.literal("text"), text: S(2000) });
export const ImageBlock = z.object({ id: id(), type: z.literal("image"), url: S(500), alt: S(160), caption: S(200) });
export const ButtonBlock = z.object({
  id: id(), type: z.literal("button"),
  label: S(60), link: S(300), style: z.enum(["solid", "outline"]).default("solid"),
});
export const ListBlock = z.object({ id: id(), type: z.literal("list"), title: S(120), items: z.array(PriceItem).max(40).default([]) });
export const FeaturesBlock = z.object({ id: id(), type: z.literal("features"), title: S(120), items: z.array(FeatureItem).max(12).default([]) });
export const TestimonialsBlock = z.object({ id: id(), type: z.literal("testimonials"), title: S(120), items: z.array(Testimonial).max(8).default([]) });
export const FaqBlock = z.object({ id: id(), type: z.literal("faq"), title: S(120), items: z.array(FaqItem).max(20).default([]) });
export const ContactBlock = z.object({
  id: id(), type: z.literal("contact"),
  title: S(120), whatsapp: S(30), phone: S(30), email: S(120), address: S(200),
});
export const OrderFormBlock = z.object({
  id: id(), type: z.literal("orderForm"),
  title: S(120), whatsapp: S(30), button: S(60), fields: z.array(z.string().max(60)).max(8).default([]),
});
export const VideoBlock = z.object({ id: id(), type: z.literal("video"), url: S(300) });
export const FooterBlock = z.object({ id: id(), type: z.literal("footer"), text: S(300) });

export const Block = z.discriminatedUnion("type", [
  HeroBlock, HeadingBlock, TextBlock, ImageBlock, ButtonBlock, ListBlock, FeaturesBlock,
  TestimonialsBlock, FaqBlock, ContactBlock, OrderFormBlock, VideoBlock, FooterBlock,
]);

export type Block = z.infer<typeof Block>;
export type BlockType = Block["type"];
export const BLOCK_TYPES = Block.options.map((o) => o.shape.type.value) as BlockType[];

/* ------------------------------------------------------------------ */
/* Sites et pages                                                       */
/* ------------------------------------------------------------------ */

export const THEME_IDS = ["clean", "paper", "midnight", "forest"] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export const SiteSettings = z.object({
  title: S(120),
  description: S(300),
  lang: z.enum(["fr", "en"]).default("fr"),
  theme: z.enum(THEME_IDS).default("clean"),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#4b3fd1"),
  radius: z.enum(["sm", "md", "lg"]).default("md"),
  font: z.enum(["sans", "serif", "rounded", "mono"]).default("sans"),
  emoji: S(8),
  whatsappFloat: S(30),
});
export type SiteSettings = z.infer<typeof SiteSettings>;

/** Adresse en ligne d'un projet publié (la clé de gestion reste dans le navigateur). */
export const Publication = z.object({ slug: z.string().min(2).max(40) });
export type Publication = z.infer<typeof Publication>;

const siteCore = {
  name: S(80),
  settings: SiteSettings.prefault({}),
  blocks: z.array(Block).max(60).default([]),
};
const siteShape = { ...siteCore, publication: Publication.optional() };
export const SiteProject = z.object({ kind: z.literal("site"), ...siteShape });
export const PageProject = z.object({ kind: z.literal("page"), ...siteShape });
export type SiteProject = z.infer<typeof SiteProject>;
export type PageProject = z.infer<typeof PageProject>;

/* ------------------------------------------------------------------ */
/* Bots Telegram — arbre à plat : chaque nœud pointe vers son parent    */
/* ------------------------------------------------------------------ */

export const ROOT = "root";
export const BOT_MAX_DEPTH = 4;

export const BotNode = z.object({
  id: z.string().min(1).max(40).default(() => uid()),
  parent: z.string().min(1).max(40).default(ROOT),
  label: S(60),
  type: z.enum(["message", "link", "ask"]).default("message"),
  text: S(3500),
  url: S(300),
});
export type BotNode = z.infer<typeof BotNode>;

export const BotProject = z.object({
  kind: z.literal("bot"),
  name: S(80),
  lang: z.enum(["fr", "en"]).default("fr"),
  welcome: S(1500),
  columns: z.union([z.literal(1), z.literal(2)]).default(1),
  backButton: z.boolean().default(true),
  nodes: z.array(BotNode).max(80).default([]),
});
export type BotProject = z.infer<typeof BotProject>;

/* ------------------------------------------------------------------ */
/* Applications : boutique avec comptes clients, commandes et paiement  */
/* ------------------------------------------------------------------ */

const Num = (max = 1e9) => z.number().min(0).max(max).default(0);

export const Product = z.object({
  id: z.string().min(1).max(40).default(() => uid()),
  name: S(120),
  price: Num(),
  description: S(400),
  image: S(500),
  category: S(60),
  /** null = stock illimité. */
  stock: z.number().int().min(0).max(1_000_000).nullable().default(null),
  active: z.boolean().default(true),
});
export type Product = z.infer<typeof Product>;

export const MomoAccount = z.object({ operator: S(40), number: S(30), holder: S(80) });
export type MomoAccount = z.infer<typeof MomoAccount>;

export const PaymentConfig = z.object({
  /** Paiement à la livraison ou au retrait. */
  cod: z.boolean().default(true),
  /** Paiement par Mobile Money : le client envoie l'argent puis saisit la référence de la transaction. */
  momo: z.array(MomoAccount).max(6).default([]),
  /** Lien de paiement externe (agrégateur, Wave…). {amount} et {order} sont remplacés. */
  linkLabel: S(40),
  linkUrl: S(300),
});
export type PaymentConfig = z.infer<typeof PaymentConfig>;

export const NotifyConfig = z.object({ telegramBotToken: S(120), telegramChatId: S(40) });
export type NotifyConfig = z.infer<typeof NotifyConfig>;

export const ShopConfig = z.object({
  currency: z.string().max(10).default("FCFA"),
  deliveryFee: Num(),
  /** Livraison offerte à partir de ce montant (0 = jamais). */
  freeDeliveryFrom: Num(),
  minOrder: Num(),
  whatsapp: S(30),
  orderNote: S(300),
});
export type ShopConfig = z.infer<typeof ShopConfig>;

export const AppProject = z.object({
  kind: z.literal("app"),
  name: S(80),
  settings: SiteSettings.prefault({}),
  shop: ShopConfig.prefault({}),
  payments: PaymentConfig.prefault({}),
  notify: NotifyConfig.prefault({}),
  products: z.array(Product).max(300).default([]),
  /** Page d'accueil de la boutique. */
  blocks: z.array(Block).max(40).default([]),
  publication: Publication.optional(),
});
export type AppProject = z.infer<typeof AppProject>;

/* ------------------------------------------------------------------ */
/* Projet = l'un des trois types                                        */
/* ------------------------------------------------------------------ */

export const Project = z.discriminatedUnion("kind", [SiteProject, PageProject, AppProject, BotProject]);
export type Project = z.infer<typeof Project>;
export type ProjectKind = Project["kind"];
export type SiteLike = SiteProject | PageProject;
/** Tout projet qui a des réglages de page et des blocs. */
export type PageLike = SiteLike | AppProject;

export const isSiteLike = (p: Project): p is SiteLike => p.kind === "site" || p.kind === "page";
export const isPageLike = (p: Project): p is PageLike => p.kind !== "bot";
/** Projets qui peuvent être publiés en ligne. */
export const isPublishable = isPageLike;

/** Brouillons produits par l'IA : le type est imposé par la requête, pas par le modèle. */
export const SiteDraft = z.object(siteCore);
export const AppDraft = AppProject.omit({ kind: true, notify: true, publication: true });
export const BotDraft = BotProject.omit({ kind: true });

/** Projet tel que sauvegardé dans le navigateur. */
export const StoredProject = z.object({
  id: z.string().min(1).max(40),
  updatedAt: z.number(),
  project: Project,
});
export type StoredProject = z.infer<typeof StoredProject>;

/* ------------------------------------------------------------------ */
/* Normalisation : garantit un projet cohérent quoi qu'il arrive        */
/* ------------------------------------------------------------------ */

export function normalizeBot(bot: BotProject): BotProject {
  const seen = new Set<string>();
  const nodes: BotNode[] = [];
  for (const raw of bot.nodes) {
    let nid = raw.id === ROOT ? uid() : raw.id;
    while (seen.has(nid)) nid = uid();
    seen.add(nid);
    const label = raw.label.trim() || "Sans titre";
    const link = raw.type === "link" && !/^(https?:\/\/|tg:\/\/)/i.test(raw.url.trim());
    nodes.push({ ...raw, id: nid, label, type: link ? "message" : raw.type });
  }
  // Parents inconnus → racine
  const ids = new Set(nodes.map((n) => n.id));
  for (const n of nodes) if (n.parent !== ROOT && (!ids.has(n.parent) || n.parent === n.id)) n.parent = ROOT;
  // Profondeur et cycles : ce qui dépasse remonte à la racine
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const depth = (n: BotNode): number => {
    let d = 1;
    const visited = new Set<string>([n.id]);
    for (let cur = n; cur.parent !== ROOT; ) {
      const next = byId.get(cur.parent);
      if (!next || visited.has(next.id)) return Infinity;
      visited.add(next.id);
      cur = next;
      d++;
    }
    return d;
  };
  for (const n of nodes) if (depth(n) > BOT_MAX_DEPTH) n.parent = ROOT;
  // Les nœuds "lien" et "question" ne portent pas d'enfants
  const leaves = new Set(nodes.filter((n) => n.type !== "message").map((n) => n.id));
  for (const n of nodes) if (leaves.has(n.parent)) n.parent = ROOT;
  return { ...bot, nodes };
}

export function normalizeApp(app: AppProject): AppProject {
  const seen = new Set<string>();
  const products = app.products.map((p) => {
    let id = p.id;
    while (seen.has(id)) id = uid();
    seen.add(id);
    return { ...p, id, name: p.name.trim() || "Produit" };
  });
  return { ...app, products };
}

export function normalizeProject(project: Project): Project {
  if (project.kind === "bot") return normalizeBot(project);
  if (project.kind === "app") return normalizeApp(project);
  return project;
}
