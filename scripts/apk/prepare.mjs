// Génère un projet Android (Capacitor) qui affiche la boutique publiée dans une application native.
// Usage : APP_URL=… APP_NAME=… APP_SLUG=… APP_COLOR=… node scripts/apk/prepare.mjs <dossier>
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const out = resolve(process.argv[2] ?? "build/apk");
const url = process.env.APP_URL ?? "";
const slug = process.env.APP_SLUG ?? "";
const color = process.env.APP_COLOR ?? "";
const name = (process.env.APP_NAME ?? "").replace(/[<>&"'\\]/g, "").trim().slice(0, 30);

const fail = (m) => { console.error(`Erreur : ${m}`); process.exit(1); };
let parsed;
try { parsed = new URL(url); } catch { fail("APP_URL invalide"); }
if (parsed.protocol !== "https:") fail("APP_URL doit être en https");
if (!/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])$/.test(slug)) fail("APP_SLUG invalide");
if (!/^#[0-9a-fA-F]{6}$/.test(color)) fail("APP_COLOR invalide");
if (!name) fail("APP_NAME vide");

// Identifiant de paquet Java valide : chaque segment commence par une lettre.
const appId = `app.appforge.s${slug.replace(/[^a-z0-9]/g, "")}`;
const CAP = "8.6.2";
const run = (cmd, args, cwd = out) => execFileSync(cmd, args, { cwd, stdio: "inherit" });

mkdirSync(join(out, "www"), { recursive: true });
writeFileSync(join(out, "package.json"), JSON.stringify({ name: "appforge-apk", private: true, version: "1.0.0" }));
// Page de secours si le téléphone est hors connexion au lancement.
writeFileSync(join(out, "www", "index.html"), `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${name}</title><style>body{font:18px system-ui;display:grid;place-content:center;min-height:100vh;margin:0;text-align:center;padding:24px;background:${color};color:#fff}button{font:inherit;padding:12px 22px;border-radius:99px;border:0;margin-top:16px;background:#fff;color:${color};font-weight:700}</style></head><body><h1>${name}</h1><p>Connexion impossible pour le moment.</p><button onclick="location.href='${parsed.href}'">Réessayer</button></body></html>`);
writeFileSync(join(out, "capacitor.config.json"), JSON.stringify({
  appId, appName: name, webDir: "www", backgroundColor: color,
  server: { url: parsed.href, cleartext: false, allowNavigation: [parsed.hostname] },
  android: { allowMixedContent: false },
}, null, 2));

run("npm", ["install", "--no-audit", "--no-fund", `@capacitor/core@${CAP}`, `@capacitor/cli@${CAP}`, `@capacitor/android@${CAP}`, "sharp@0.34"]);
run("npx", ["cap", "add", "android"]);
run("npx", ["cap", "sync", "android"]);

// Icône : initiale du nom en blanc sur la couleur de la boutique.
const { default: sharp } = await import(join(out, "node_modules", "sharp", "lib", "index.js"));
const letter = name.trim().slice(0, 1).toUpperCase().replace(/[^\p{L}\p{N}]/gu, "") || "A";
const svg = (size, { round = false, bg = true } = {}) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
${bg ? `<rect width="100" height="100" rx="${round ? 50 : 22}" fill="${color}"/>` : ""}
<text x="50" y="50" text-anchor="middle" dominant-baseline="central" font-family="DejaVu Sans, Arial, sans-serif" font-weight="700" font-size="${bg ? 54 : 38}" fill="#fff">${letter}</text></svg>`;
const res = join(out, "android", "app", "src", "main", "res");
const legacy = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
for (const [d, px] of Object.entries(legacy)) {
  const dir = join(res, `mipmap-${d}`);
  await sharp(Buffer.from(svg(px * 2))).resize(px, px).png().toFile(join(dir, "ic_launcher.png"));
  await sharp(Buffer.from(svg(px * 2, { round: true }))).resize(px, px).png().toFile(join(dir, "ic_launcher_round.png"));
  // Icône adaptative : premier plan 108 dp, lettre dans la zone sûre.
  const fg = Math.round(px * 108 / 48);
  await sharp(Buffer.from(svg(fg * 2, { bg: false }))).resize(fg, fg).png().toFile(join(dir, "ic_launcher_foreground.png"));
}
const bgFile = join(res, "values", "ic_launcher_background.xml");
writeFileSync(bgFile, `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${color}</color>\n</resources>\n`);

// Version lisible et vérification que le projet est bien là.
const gradle = join(out, "android", "gradlew");
if (!existsSync(gradle)) fail("gradlew absent : la génération Android a échoué");
console.log(`Projet Android prêt : ${appId} → ${parsed.href}`);
void readFileSync;
