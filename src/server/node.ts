import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { serve } from "@hono/node-server";
import { getConnInfo } from "@hono/node-server/conninfo";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { createApp } from "./app.js";
import { FileStore } from "./store.js";

/** Serveur local ou VPS : l'API + l'interface compilée (dossier dist/). */
const useSupabase = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
const api = await createApp(process.env, {
  ...(useSupabase ? {} : { store: new FileStore(process.env.DATA_FILE || "data/appforge.json") }),
  remoteAddress: (c) => {
    try {
      return getConnInfo(c).remote.address;
    } catch {
      return undefined;
    }
  },
});
const root = new Hono();
root.route("/", api);

if (existsSync("dist/index.html")) {
  root.use("*", serveStatic({ root: "./dist" }));
  root.get("/a/*", async (c) => c.html(await readFile("dist/storefront.html", "utf8")));
  root.get("*", async (c) => c.html(await readFile("dist/index.html", "utf8")));
} else {
  root.get("/", (c) => c.text("API AppForge active. Lance `npm run dev` pour l'interface, ou `npm run build` puis `npm start`."));
}

const port = Number(process.env.PORT) || 8787;
serve({ fetch: root.fetch, port }, ({ port: p }) => {
  console.log(`AppForge : http://localhost:${p}${process.env.ANTHROPIC_API_KEY ? "" : "  (IA désactivée : ANTHROPIC_API_KEY absente)"}`);
});
