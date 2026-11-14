/** Mots de passe, jetons clients et clé d'administration. Uniquement WebCrypto : fonctionne sur Node, Vercel et les runtimes edge. */

const enc = new TextEncoder();
const PBKDF2_ITERATIONS = 100_000;

export const b64u = {
  enc(bytes: Uint8Array): string {
    let s = "";
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  },
  dec(text: string): Uint8Array {
    const padded = text.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((text.length + 3) % 4);
    const bin = atob(padded);
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  },
};

export function randomToken(bytes = 18): string {
  return b64u.enc(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** Comparaison en temps constant. */
export function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64u.enc(salt)}$${b64u.enc(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iter, salt, hash] = stored.split("$");
  const iterations = Number(iter);
  if (scheme !== "pbkdf2" || !salt || !hash || !Number.isInteger(iterations) || iterations < 1000 || iterations > 1_000_000) return false;
  const actual = await pbkdf2(password, b64u.dec(salt), iterations);
  return safeEqual(b64u.enc(actual), hash);
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u.enc(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data))));
}

const TOKEN_TTL_MS = 30 * 24 * 3600 * 1000;

/** Jeton client signé : lié à une boutique et à un client, expire après 30 jours. */
export async function signToken(secret: string, slug: string, customerId: string, now = Date.now()): Promise<string> {
  const body = b64u.enc(enc.encode(JSON.stringify({ s: slug, c: customerId, e: now + TOKEN_TTL_MS })));
  return `v1.${body}.${await hmac(secret, `v1.${body}`)}`;
}

export async function verifyToken(secret: string, token: string, slug: string, now = Date.now()): Promise<string | null> {
  const [v, body, sig] = token.split(".");
  if (v !== "v1" || !body || !sig) return null;
  if (!safeEqual(await hmac(secret, `v1.${body}`), sig)) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(b64u.dec(body))) as { s?: string; c?: string; e?: number };
    if (p.s !== slug || typeof p.c !== "string" || typeof p.e !== "number" || p.e < now) return null;
    return p.c;
  } catch {
    return null;
  }
}
