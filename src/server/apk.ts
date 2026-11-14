import { Hono } from "hono";
import { z } from "zod";
import { isHex } from "../core/util.js";
import { safeEqual, sha256Hex } from "./auth.js";
import type { Store } from "./store.js";

export interface ApkEnv {
  GITHUB_TOKEN?: string | undefined;
  GITHUB_REPO?: string | undefined;
  PUBLIC_URL?: string | undefined;
}

const Body = z.object({ slug: z.string().max(40), key: z.string().max(100) });

/** Lance et suit la compilation de l'APK via GitHub Actions (workflow apk.yml). */
export function createApkRoutes(env: ApkEnv, store: Store, fetchImpl: typeof fetch): Hono {
  const r = new Hono();
  const repo = env.GITHUB_REPO || "veloptix1/sbcexplication";
  const gh = (path: string, init: RequestInit = {}) =>
    fetchImpl(`https://api.github.com/repos/${repo}${path}`, {
      ...init,
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${env.GITHUB_TOKEN}`,
        "x-github-api-version": "2022-11-28",
        "user-agent": "appforge",
        ...(init.body ? { "content-type": "application/json" } : {}),
      },
      signal: AbortSignal.timeout(15_000),
    });

  r.post("/api/apk/build", async (c) => {
    if (!env.GITHUB_TOKEN) return c.json({ error: "La compilation automatique n'est pas configurée (GITHUB_TOKEN manquant). Lance le workflow « APK » depuis l'onglet Actions de GitHub.", code: "not_configured" }, 503);
    const body = Body.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "Requête invalide." }, 400);
    const shop = await store.getShop(body.data.slug);
    if (!shop || !safeEqual(await sha256Hex(body.data.key), shop.ownerHash)) return c.json({ error: "Clé d'administration invalide." }, 401);
    if (shop.project.kind !== "app") return c.json({ error: "Seules les applications se compilent en APK." }, 400);

    const origin = (env.PUBLIC_URL || new URL(c.req.url).origin).replace(/\/+$/, "");
    if (!origin.startsWith("https://")) return c.json({ error: "L'APK exige une adresse https. Définis PUBLIC_URL sur le serveur." }, 400);
    const accent = isHex(shop.project.settings.accent) ? shop.project.settings.accent : "#4b3fd1";
    const res = await gh("/actions/workflows/apk.yml/dispatches", {
      method: "POST",
      body: JSON.stringify({ ref: "main", inputs: { slug: shop.slug, url: `${origin}/a/${shop.slug}`, name: shop.project.name.slice(0, 30), color: accent } }),
    }).catch(() => null);
    if (!res) return c.json({ error: "GitHub est injoignable." }, 502);
    if (res.status === 204) return c.json({ ok: true });
    if (res.status === 401 || res.status === 403) return c.json({ error: "GitHub refuse le jeton (il doit avoir la permission « Actions : lecture et écriture »)." }, 502);
    if (res.status === 404 || res.status === 422) return c.json({ error: "Workflow « APK » introuvable sur la branche main du dépôt. Pousse d'abord .github/workflows/apk.yml." }, 502);
    return c.json({ error: `GitHub a répondu ${res.status}.` }, 502);
  });

  r.get("/api/apk/status/:slug", async (c) => {
    if (!env.GITHUB_TOKEN) return c.json({ state: "unconfigured" });
    const slug = c.req.param("slug");
    const runs = await gh("/actions/workflows/apk.yml/runs?event=workflow_dispatch&per_page=20").then((x) => (x.ok ? (x.json() as Promise<{ workflow_runs?: { name: string; status: string; conclusion: string | null; html_url: string; created_at: string }[] }>) : null)).catch(() => null);
    const run = runs?.workflow_runs?.find((w) => w.name === `APK ${slug}`);
    if (!run) return c.json({ state: "none" });
    if (run.status !== "completed") return c.json({ state: "running", runUrl: run.html_url });
    if (run.conclusion !== "success") return c.json({ state: "failed", runUrl: run.html_url });
    return c.json({ state: "done", runUrl: run.html_url, downloadUrl: `https://github.com/${repo}/releases/download/apk-${slug}/${slug}.apk`, releaseUrl: `https://github.com/${repo}/releases/tag/apk-${slug}` });
  });
  return r;
}
