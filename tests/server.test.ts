import { describe, expect, it, vi } from "vitest";
import { generateProject, systemPrompt, toolSchema } from "../src/core/ai.js";
import { createApp, type ServerEnv } from "../src/server/app.js";
import { RateLimiter } from "../src/server/rate-limit.js";

const toolReply = (input: unknown, id = "tu_1") =>
  new Response(JSON.stringify({ content: [{ type: "tool_use", id, name: "build_project", input }] }), { status: 200, headers: { "content-type": "application/json" } });

const goodSite = { name: "Salon Awa", settings: { title: "Salon Awa", accent: "#aa3366" }, blocks: [{ type: "hero", title: "Bienvenue", text: "Coiffure à Douala" }, { type: "footer", text: "© Salon Awa" }] };

const post = async (appP: Awaited<ReturnType<typeof createApp>> | ReturnType<typeof createApp>, body: unknown, headers: Record<string, string> = {}) =>
  (await appP).request("/api/generate", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

describe("schéma de l'outil IA", () => {
  it("ne contient ni $schema, ni default, ni oneOf", () => {
    for (const kind of ["site", "page", "bot"] as const) {
      const text = JSON.stringify(toolSchema(kind));
      expect(text).not.toContain("$schema");
      expect(text).not.toContain('"default"');
      expect(text).not.toContain("oneOf");
    }
  });
  it("le prompt système cite tous les types de blocs", () => {
    const prompt = systemPrompt("site", "fr");
    for (const t of ["hero", "features", "orderForm", "faq", "footer"]) expect(prompt).toContain(`"${t}"`);
  });
});

describe("generateProject", () => {
  const opts = (fetchImpl: typeof fetch) => ({ apiKey: "k", model: "m", fetchImpl });

  it("valide la sortie, complète les valeurs par défaut et impose le type demandé", async () => {
    const fetchImpl = vi.fn(async () => toolReply(goodSite)) as unknown as typeof fetch;
    const p = await generateProject({ kind: "page", prompt: "salon de coiffure", lang: "fr" }, opts(fetchImpl));
    expect(p.kind).toBe("page");
    if (p.kind === "bot") throw new Error("type inattendu");
    expect(p.blocks).toHaveLength(2);
    expect(p.blocks[0]?.id).toBeTruthy();
    expect(p.settings.theme).toBe("clean");
    const sent = JSON.parse((vi.mocked(fetchImpl).mock.calls[0]![1] as RequestInit).body as string);
    expect(sent.tool_choice).toEqual({ type: "tool", name: "build_project" });
    expect(sent.messages[0].content).toBe("salon de coiffure");
  });

  it("redemande une fois avec l'erreur quand la structure est invalide", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(toolReply({ name: "x", blocks: [{ type: "inconnu" }] }, "tu_bad"))
      .mockResolvedValueOnce(toolReply(goodSite)) as unknown as typeof fetch;
    const p = await generateProject({ kind: "site", prompt: "un site", lang: "fr" }, opts(fetchImpl));
    expect(p.kind).toBe("site");
    expect(vi.mocked(fetchImpl)).toHaveBeenCalledTimes(2);
    const second = JSON.parse((vi.mocked(fetchImpl).mock.calls[1]![1] as RequestInit).body as string);
    const last = second.messages.at(-1);
    expect(last.content[0]).toMatchObject({ type: "tool_result", tool_use_id: "tu_bad", is_error: true });
  });

  it("abandonne proprement après deux sorties invalides", async () => {
    const fetchImpl = vi.fn(async () => toolReply({ blocks: [] })) as unknown as typeof fetch;
    await expect(generateProject({ kind: "site", prompt: "un site", lang: "fr" }, opts(fetchImpl))).rejects.toMatchObject({ status: 502 });
    expect(vi.mocked(fetchImpl)).toHaveBeenCalledTimes(2);
  });

  it("répare un bot : parents inconnus, textes trop longs", async () => {
    const bot = { name: "B", welcome: "x".repeat(5000), nodes: [{ id: "a", parent: "nulle-part", label: "A", type: "message", text: "ok" }] };
    const p = await generateProject({ kind: "bot", prompt: "un bot", lang: "fr" }, opts((async () => toolReply(bot)) as unknown as typeof fetch));
    if (p.kind !== "bot") throw new Error("type inattendu");
    expect(p.nodes[0]?.parent).toBe("root");
    expect(p.welcome.length).toBe(1500);
  });

  it.each([[401, 502], [429, 429], [529, 429], [500, 502]])("erreur amont %i → %i", async (upstream, expected) => {
    const fetchImpl = (async () => new Response("{}", { status: upstream })) as unknown as typeof fetch;
    await expect(generateProject({ kind: "site", prompt: "un site", lang: "fr" }, opts(fetchImpl))).rejects.toMatchObject({ status: expected });
  });

  it("temps dépassé → 504", async () => {
    const fetchImpl = (async () => { throw Object.assign(new Error("t"), { name: "TimeoutError" }); }) as unknown as typeof fetch;
    await expect(generateProject({ kind: "site", prompt: "un site", lang: "fr" }, opts(fetchImpl))).rejects.toMatchObject({ status: 504 });
  });
});

describe("API", () => {
  const env: ServerEnv = { ANTHROPIC_API_KEY: "secret-key" };

  it("health ne révèle aucun secret", async () => {
    const res = await (await createApp({ ...env, ACCESS_CODE: "abc" })).request("/api/health");
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, ai: true, protected: true });
    expect(JSON.stringify(body)).not.toContain("secret-key");
    expect(JSON.stringify(body)).not.toContain("abc");
  });

  it("refuse les requêtes invalides avec un message lisible", async () => {
    const app = await createApp(env);
    expect((await post(app, { kind: "x", prompt: "un site" })).status).toBe(400);
    const short = await post(app, { kind: "site", prompt: "ab" });
    expect(short.status).toBe(400);
    expect((await short.json()).error).toContain("5 caractères");
    expect((await app.request("/api/generate", { method: "POST", body: "pas du json" })).status).toBe(400);
    expect((await post(app, { kind: "site", prompt: "x".repeat(20_000) })).status).toBe(413);
  });

  it("répond 503 sans clé API et 404 sur une route inconnue", async () => {
    const app = await createApp({});
    expect((await post(app, { kind: "site", prompt: "un salon de coiffure" })).status).toBe(503);
    expect((await app.request("/api/nope")).status).toBe(404);
  });

  it("exige le code d'accès quand il est défini", async () => {
    const fetchImpl = (async () => toolReply(goodSite)) as unknown as typeof fetch;
    const app = await createApp({ ...env, ACCESS_CODE: "sesame" }, { fetchImpl });
    expect((await post(app, { kind: "site", prompt: "un salon de coiffure" })).status).toBe(401);
    expect((await post(app, { kind: "site", prompt: "un salon de coiffure", code: "faux" })).status).toBe(401);
    expect((await post(app, { kind: "site", prompt: "un salon de coiffure", code: "sesame" })).status).toBe(200);
  });

  it("limite les générations par adresse IP", async () => {
    const fetchImpl = (async () => toolReply(goodSite)) as unknown as typeof fetch;
    const app = await createApp({ ...env, MAX_GENERATIONS_PER_HOUR: "2" }, { fetchImpl });
    const go = (ip: string) => post(app, { kind: "site", prompt: "un salon de coiffure" }, { "x-forwarded-for": ip });
    expect((await go("1.1.1.1")).status).toBe(200);
    expect((await go("1.1.1.1")).status).toBe(200);
    const limited = await go("1.1.1.1");
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await go("2.2.2.2")).status).toBe(200);
  });

  it("renvoie le projet généré", async () => {
    const fetchImpl = (async () => toolReply(goodSite)) as unknown as typeof fetch;
    const res = await post(createApp(env, { fetchImpl }), { kind: "site", prompt: "un salon de coiffure à Douala" });
    expect(res.status).toBe(200);
    const { project } = await res.json();
    expect(project.kind).toBe("site");
    expect(project.blocks[0].title).toBe("Bienvenue");
  });
});

describe("RateLimiter", () => {
  it("libère après la fenêtre et borne la mémoire", () => {
    const rl = new RateLimiter(1, 1000, 3);
    expect(rl.hit("a", 0)).toBe(0);
    expect(rl.hit("a", 500)).toBeGreaterThan(0);
    expect(rl.hit("a", 1500)).toBe(0);
    for (let i = 0; i < 20; i++) rl.hit(`k${i}`, 2000);
    expect(rl.hit("fresh", 2000)).toBe(0);
  });
});
