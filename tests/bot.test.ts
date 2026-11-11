import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { botFiles, botView } from "../src/core/bot.js";
import type { BotProject } from "../src/core/schema.js";
import { findTemplate } from "../src/core/templates.js";

const TOKEN = "123:TEST";
const template = () => findTemplate("bot-boutique")!.build() as BotProject;

describe("botView", () => {
  it("menu principal : boutons des enfants de la racine, pas de navigation", () => {
    const bot = template();
    const v = botView(bot, null);
    expect(v.text).toContain("Bienvenue");
    expect(v.keyboard.flat().map((b) => b.text)).toEqual(bot.nodes.filter((n) => n.parent === "root").map((n) => n.label));
    expect(v.keyboard.flat().find((b) => b.text.includes("WhatsApp"))).toHaveProperty("url");
  });

  it("sous-menu : ajoute Retour et Menu principal, et respecte le nombre de colonnes", () => {
    const bot = { ...template(), columns: 2 as const };
    const cat = bot.nodes.find((n) => n.label.includes("Catalogue"))!;
    const v = botView(bot, cat.id);
    expect(v.keyboard[0]).toHaveLength(2);
    const nav = v.keyboard.at(-1)!;
    expect(nav.map((b) => b.text)).toEqual(["⬅️ Retour", "🏠 Menu principal"]);
    expect(botView({ ...bot, backButton: false }, cat.id).keyboard.at(-1)).toHaveLength(1);
  });

  it("un nœud « question » attend un message", () => {
    const bot = template();
    expect(botView(bot, bot.nodes.find((n) => n.type === "ask")!.id).awaiting).toBe(true);
  });
});

describe("bot exporté", () => {
  let server: Server | undefined;
  let dir = "";
  afterAll(async () => {
    server?.close();
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("contient les quatre fichiers et un script JavaScript valide", () => {
    const files = botFiles(template());
    expect(Object.keys(files).sort()).toEqual([".env.example", "README.md", "bot.mjs", "package.json"]);
    expect(() => new Function(files["bot.mjs"]!.replace(/^import .*$/m, "").replace(/main\(\);\s*$/, ""))).not.toThrow();
    expect(JSON.parse(files["package.json"]!).scripts.start).toBe("node bot.mjs");
  });

  it("répond comme le simulateur, face à un faux serveur Telegram", async () => {
    const bot = template();
    const idx = (label: string) => bot.nodes.findIndex((n) => n.label.includes(label));
    const cat = bot.nodes[idx("Catalogue")]!;
    const cmd = bot.nodes[idx("commande")]!;

    const calls: { method: string; body: Record<string, any> }[] = [];
    const updates = [
      { update_id: 1, message: { chat: { id: 42 }, text: "/start", from: { first_name: "Awa" } } },
      { update_id: 2, callback_query: { id: "c2", data: `n${idx("Catalogue")}`, message: { message_id: 7, chat: { id: 42 } } } },
      { update_id: 3, callback_query: { id: "c3", data: "h", message: { message_id: 7, chat: { id: 42 } } } },
      { update_id: 4, callback_query: { id: "c4", data: `n${idx("commande")}`, message: { message_id: 7, chat: { id: 42 } } } },
      { update_id: 5, message: { chat: { id: 42 }, text: "2 t-shirts, taille M", from: { first_name: "Awa", username: "awa" } } },
    ];

    server = createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", async () => {
        const method = req.url!.split("/").pop()!;
        const body = raw ? JSON.parse(raw) : {};
        calls.push({ method, body });
        res.setHeader("content-type", "application/json");
        if (method === "getUpdates") {
          const pending = updates.filter((u) => u.update_id >= body.offset);
          if (pending.length === 0) await new Promise((r) => setTimeout(r, 150));
          return res.end(JSON.stringify({ ok: true, result: pending }));
        }
        res.end(JSON.stringify({ ok: true, result: true }));
      });
    });
    await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
    const port = (server.address() as AddressInfo).port;

    dir = await mkdtemp(join(tmpdir(), "appforge-bot-"));
    await writeFile(join(dir, "bot.mjs"), botFiles(bot)["bot.mjs"]!);
    const child = spawn(process.execPath, [join(dir, "bot.mjs")], {
      env: { ...process.env, BOT_TOKEN: TOKEN, ADMIN_CHAT_ID: "999", TELEGRAM_API_BASE: `http://127.0.0.1:${port}` },
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d));

    const messages = () => calls.filter((c) => ["sendMessage", "editMessageText"].includes(c.method));
    const deadline = Date.now() + 10_000;
    while (messages().length < 6 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
    child.kill();
    expect(stderr).toBe("");

    const out = messages();
    expect(out.map((c) => c.method)).toEqual(["sendMessage", "editMessageText", "editMessageText", "editMessageText", "sendMessage", "sendMessage"]);
    const same = (call: (typeof out)[number], v: ReturnType<typeof botView>) => {
      expect(call.body.text).toBe(v.text);
      expect(call.body.reply_markup.inline_keyboard).toEqual(v.keyboard);
    };
    same(out[0]!, botView(bot, null));
    same(out[1]!, botView(bot, cat.id));
    same(out[2]!, botView(bot, null));
    same(out[3]!, botView(bot, cmd.id));
    // Le message de l'utilisateur est transmis à l'administrateur, puis il reçoit un remerciement.
    expect(out[4]!.body.chat_id).toBe("999");
    expect(out[4]!.body.text).toContain("2 t-shirts, taille M");
    expect(out[4]!.body.text).toContain("@awa");
    expect(out[5]!.body.chat_id).toBe(42);
    expect(out[5]!.body.text).toContain("Merci");
    expect(calls.some((c) => c.method === "answerCallbackQuery")).toBe(true);
  });
});
