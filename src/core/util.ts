/** Utilitaires partagés (navigateur + serveur). Tout ce qui finit dans du HTML passe par ici. */

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export const esc = (value: unknown): string => String(value ?? "").replace(/[&<>"']/g, (c) => ESC[c] ?? c);

export const uid = (): string => {
  const bytes = new Uint8Array(5);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 8);
};

const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

/**
 * Retourne une URL sûre pour un attribut href/src, ou "#".
 * Refuse javascript:, data:, vbscript:… et les URL protocole-relatives.
 */
export function safeUrl(input: unknown): string {
  let url = String(input ?? "").trim();
  // eslint-disable-next-line no-control-regex
  if (!url || /[\u0000-\u001f\u007f\s]/.test(url)) return "#";
  if (url.startsWith("//")) return "#";
  if (url.startsWith("#") || url.startsWith("/") || url.startsWith("?")) return url;
  // "wa.me/237…" ou "exemple.com/page" sans schéma → https
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url) && /^[\w-]+(\.[\w-]+)+(\/|$|\?|#)/.test(url)) url = `https://${url}`;
  try {
    const parsed = new URL(url);
    return SAFE_PROTOCOLS.has(parsed.protocol) ? parsed.toString() : "#";
  } catch {
    return "#";
  }
}

/** Numéro WhatsApp → chiffres uniquement (indicatif inclus), ou "" si invalide. */
export function waDigits(input: unknown): string {
  const digits = String(input ?? "").replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15 ? digits : "";
}

export function waLink(input: unknown, text?: string): string {
  const digits = waDigits(input);
  if (!digits) return "#";
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

export const isHex = (value: unknown): value is string => typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);

/** Couleur de texte lisible (noir ou blanc) sur un fond donné. */
export function readableOn(hex: string): "#ffffff" | "#14162e" {
  if (!isHex(hex)) return "#ffffff";
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const lum = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return lum > 0.4 ? "#14162e" : "#ffffff";
}

/** URL YouTube / Vimeo → URL d'intégration autorisée, sinon null. */
export function videoEmbed(input: unknown): string | null {
  try {
    const u = new URL(String(input ?? "").trim());
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return ytEmbed(u.pathname.slice(1));
    if (host === "youtube.com" || host === "m.youtube.com") {
      if (u.pathname === "/watch") return ytEmbed(u.searchParams.get("v") ?? "");
      const m = /^\/(embed|shorts)\/([\w-]{11})/.exec(u.pathname);
      return m ? ytEmbed(m[2] ?? "") : null;
    }
    if (host === "vimeo.com" || host === "player.vimeo.com") {
      const m = /(\d{6,12})/.exec(u.pathname);
      return m ? `https://player.vimeo.com/video/${m[1]}` : null;
    }
  } catch {
    /* URL invalide */
  }
  return null;
}

const ytEmbed = (id: string): string | null => (/^[\w-]{11}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null);

export const slugify = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "projet";

/** Tronque récursivement les chaînes (sortie IA trop bavarde) avant validation. */
export function clampStrings<T>(value: T, max = 1500): T {
  if (typeof value === "string") return value.slice(0, max) as T;
  if (Array.isArray(value)) return value.map((v) => clampStrings(v, max)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clampStrings(v, max)])) as T;
  }
  return value;
}
