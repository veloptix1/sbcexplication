import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { AiError, generateProject } from "../core/ai.js";
import { createApkRoutes } from "./apk.js";
import { sha256Hex } from "./auth.js";
import { RateLimiter } from "./rate-limit.js";
import { createShopRoutes } from "./shop.js";
import { MemoryStore, SupabaseStore, type Store } from "./store.js";

export interface ServerEnv {
  ANTHROPIC_API_KEY?: string | undefined;
  ANTHROPIC_MODEL?: string | undefined;
  ACCESS_CODE?: string | undefined;
  MAX_GENERATIONS_PER_HOUR?: string | undefined;
  SUPABASE_URL?: string | undefined;
  SUPABASE_SERVICE_KEY?: string | undefined;
  SESSION_SECRET?: string | undefined;
  TELEGRAM_API_BASE?: string | undefined;
  GITHUB_TOKEN?: string | undefined;
  GITHUB_REPO?: string | undefined;
  PUBLIC_URL?: string | undefined;
}

export interface ServerDeps {
  fetchImpl?: typeof fetch;
  /** Stockage imposé (serveur Node : fichier JSON ; tests : mémoire). Sinon Supabase si configuré. */
  store?: Store;
  /** Adresse du client quand les en-têtes proxy sont absents (serveur Node local). */
  remoteAddress?: (c: Context) => string | undefined;
}

const GenerateBody = z.object({
  kind: z.enum(["site", "page", "app", "bot"]),
  prompt: z.string().trim().min(5, "Décris ton projet en quelques mots (5 caractères minimum).").max(2000, "Description trop longue (2 000 caractères maximum)."),
  lang: z.enum(["fr", "en"]).default("fr"),
  code: z.string().max(200).optional(),
});

/** Comparaison en temps constant, pour ne pas laisser deviner le code d'accès. */
function sameSecret(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

const clientIp = (headers: Headers, fallback?: string): string =>
  headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || fallback || "inconnu";

export async function createApp(env: ServerEnv, deps: ServerDeps = {}): Promise<Hono> {
  const app = new Hono();
  const max = Math.max(1, Number.parseInt(env.MAX_GENERATIONS_PER_HOUR ?? "", 10) || 10);
  const limiter = new RateLimiter(max);
  const model = env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

  app.use("*", async (c, next) => {
    await next();
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Cache-Control", "no-store");
  });

  const store: Store =
    deps.store ?? (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY ? new SupabaseStore(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, deps.fetchImpl) : new MemoryStore());
  // Secret des sessions clients : fourni, sinon dérivé de la clé Supabase (stable entre instances), sinon aléatoire (sessions perdues au redémarrage).
  const secretPromise = env.SESSION_SECRET ? Promise.resolve(env.SESSION_SECRET) : env.SUPABASE_SERVICE_KEY ? sha256Hex(`appforge:${env.SUPABASE_SERVICE_KEY}`) : Promise.resolve(crypto.randomUUID() + crypto.randomUUID());

  app.get("/api/health", (c) => c.json({ ok: true, ai: Boolean(env.ANTHROPIC_API_KEY), protected: Boolean(env.ACCESS_CODE), limitPerHour: max, storage: store.kind, persistent: store.persistent, apk: Boolean(env.GITHUB_TOKEN) }));

  app.post(
    "/api/generate",
    bodyLimit({ maxSize: 16 * 1024, onError: (c) => c.json({ error: "Requête trop volumineuse." }, 413) }),
    async (c) => {
      const body = GenerateBody.safeParse(await c.req.json().catch(() => null));
      if (!body.success) return c.json({ error: body.error.issues[0]?.message ?? "Requête invalide." }, 400);
      const { kind, prompt, lang, code } = body.data;

      if (env.ACCESS_CODE && !sameSecret(code ?? "", env.ACCESS_CODE)) return c.json({ error: "Code d'accès invalide." }, 401);
      if (!env.ANTHROPIC_API_KEY) return c.json({ error: "La génération par IA n'est pas configurée sur ce serveur (ANTHROPIC_API_KEY manquante). Les modèles restent disponibles." }, 503);

      const wait = limiter.hit(clientIp(c.req.raw.headers, deps.remoteAddress?.(c)));
      if (wait > 0) {
        c.header("Retry-After", String(wait));
        return c.json({ error: `Limite de ${max} générations par heure atteinte. Réessaie dans ${Math.ceil(wait / 60)} min.` }, 429);
      }

      try {
        const project = await generateProject({ kind, prompt, lang }, { apiKey: env.ANTHROPIC_API_KEY, model, ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}) });
        return c.json({ project });
      } catch (e) {
        if (e instanceof AiError) return c.json({ error: e.message }, e.status);
        console.error("generate:", e);
        return c.json({ error: "Erreur inattendue pendant la génération." }, 500);
      }
    },
  );

  app.route("/", createShopRoutes({
    store,
    secret: await secretPromise,
    fetchImpl: deps.fetchImpl ?? fetch,
    telegramBase: env.TELEGRAM_API_BASE || "https://api.telegram.org",
    clientIp: (c) => clientIp(c.req.raw.headers, deps.remoteAddress?.(c)),
  }));

  app.route("/", createApkRoutes(env, store, deps.fetchImpl ?? fetch));

  app.all("/api/*", (c) => c.json({ error: "Route inconnue." }, 404));
  return app;
}
