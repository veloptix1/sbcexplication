import { ROOT, type BotNode, type BotProject } from "./schema.js";
import { slugify } from "./util.js";

export type Button = { text: string; url: string } | { text: string; callback_data: string };
export interface BotView {
  text: string;
  keyboard: Button[][];
  /** Le prochain message de l'utilisateur sera transmis à l'administrateur. */
  awaiting: boolean;
}

export const BOT_LABELS = {
  fr: { back: "Retour", home: "Menu principal", thanks: "Merci ! Ton message a bien été transmis.", empty: "Ce menu est vide." },
  en: { back: "Back", home: "Main menu", thanks: "Thanks! Your message has been forwarded.", empty: "This menu is empty." },
} as const;

const children = (bot: BotProject, parent: string): BotNode[] => bot.nodes.filter((n) => n.parent === parent);
const indexOf = (bot: BotProject, id: string): number => bot.nodes.findIndex((n) => n.id === id);

/**
 * Ce que le bot affiche pour un nœud (null = menu principal).
 * Le simulateur de l'éditeur et le bot exporté suivent la même règle ;
 * tests/bot.test.ts vérifie qu'ils produisent exactement les mêmes messages.
 */
export function botView(bot: BotProject, nodeId: string | null): BotView {
  const L = BOT_LABELS[bot.lang] ?? BOT_LABELS.fr;
  const node = nodeId && nodeId !== ROOT ? bot.nodes.find((n) => n.id === nodeId) : undefined;
  const parentId = node ? node.parent : ROOT;
  const kids = node && node.type !== "message" ? [] : children(bot, node ? node.id : ROOT);

  const buttons: Button[] = kids.map((k) =>
    k.type === "link" ? { text: k.label, url: k.url } : { text: k.label, callback_data: `n${indexOf(bot, k.id)}` },
  );
  const keyboard: Button[][] = [];
  for (let i = 0; i < buttons.length; i += bot.columns) keyboard.push(buttons.slice(i, i + bot.columns));

  if (node) {
    const nav: Button[] = [];
    if (bot.backButton) nav.push({ text: `⬅️ ${L.back}`, callback_data: parentId === ROOT ? "h" : `n${indexOf(bot, parentId)}` });
    nav.push({ text: `🏠 ${L.home}`, callback_data: "h" });
    keyboard.push(nav);
  }

  let text = node ? node.text.trim() || node.label : bot.welcome.trim() || bot.name || "👋";
  if (!node && kids.length === 0) text = `${text}\n\n${L.empty}`;
  return { text, keyboard, awaiting: node?.type === "ask" };
}

/* ------------------------------------------------------------------ */
/* Export : un bot Node.js sans aucune dépendance (fetch natif)         */
/* ------------------------------------------------------------------ */

const RUNTIME = String.raw`// Bot Telegram généré par AppForge. Aucune dépendance : Node.js 18 ou plus.
// Lancement : BOT_TOKEN=xxx node bot.mjs   (ou : npm start avec un fichier .env chargé)
import process from 'node:process';

const DATA = __DATA__;
const TOKEN = process.env.BOT_TOKEN || '';
const ADMIN = process.env.ADMIN_CHAT_ID || '';
const BASE = process.env.TELEGRAM_API_BASE || 'https://api.telegram.org';
const L = DATA.labels;

if (!TOKEN) {
  console.error('BOT_TOKEN manquant. Crée un bot avec @BotFather puis copie son token (voir .env.example).');
  process.exit(1);
}

const call = async (method, body) => {
  const res = await fetch(BASE + '/bot' + TOKEN + '/' + method, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const json = await res.json().catch(() => ({ ok: false, description: 'HTTP ' + res.status }));
  if (!json.ok) throw new Error(method + ' : ' + (json.description || res.status));
  return json.result;
};

const nodes = DATA.nodes;
const indexOf = (id) => nodes.findIndex((n) => n.id === id);

function view(node) {
  const parentId = node ? node.parent : 'root';
  const kids = node && node.type !== 'message' ? [] : nodes.filter((n) => n.parent === (node ? node.id : 'root'));
  const buttons = kids.map((k) =>
    k.type === 'link' ? { text: k.label, url: k.url } : { text: k.label, callback_data: 'n' + indexOf(k.id) });
  const keyboard = [];
  for (let i = 0; i < buttons.length; i += DATA.columns) keyboard.push(buttons.slice(i, i + DATA.columns));
  if (node) {
    const nav = [];
    if (DATA.backButton) nav.push({ text: '⬅️ ' + L.back, callback_data: parentId === 'root' ? 'h' : 'n' + indexOf(parentId) });
    nav.push({ text: '🏠 ' + L.home, callback_data: 'h' });
    keyboard.push(nav);
  }
  let text = node ? (node.text.trim() || node.label) : (DATA.welcome.trim() || DATA.name || '👋');
  if (!node && kids.length === 0) text = text + '\n\n' + L.empty;
  return { text, keyboard, awaiting: !!node && node.type === 'ask' };
}

const waiting = new Map(); // chat_id -> nœud "question" en attente d'un message

async function show(chatId, node, messageId) {
  const v = view(node);
  const payload = { chat_id: chatId, text: v.text, reply_markup: { inline_keyboard: v.keyboard } };
  if (v.awaiting) waiting.set(chatId, node.id); else waiting.delete(chatId);
  if (messageId) {
    try { await call('editMessageText', { ...payload, message_id: messageId }); return; } catch (e) { /* message identique ou trop ancien */ }
  }
  await call('sendMessage', payload);
}

async function onMessage(m) {
  const chatId = m.chat.id;
  const text = (m.text || '').trim();
  const pending = waiting.get(chatId);
  if (pending && text && !text.startsWith('/')) {
    const node = nodes.find((n) => n.id === pending);
    waiting.delete(chatId);
    if (ADMIN) {
      const from = m.from || {};
      const who = [from.first_name, from.last_name].filter(Boolean).join(' ') + (from.username ? ' (@' + from.username + ')' : '');
      await call('sendMessage', { chat_id: ADMIN, text: '📩 ' + (node ? node.label : '') + '\nDe : ' + who + ' [' + chatId + ']\n\n' + text });
    } else {
      console.warn('ADMIN_CHAT_ID non défini : message reçu mais non transmis :', text);
    }
    await call('sendMessage', { chat_id: chatId, text: L.thanks, reply_markup: { inline_keyboard: view(null).keyboard } });
    return;
  }
  await show(chatId, null);
}

async function onCallback(q) {
  await call('answerCallbackQuery', { callback_query_id: q.id }).catch(() => {});
  const chatId = q.message && q.message.chat.id;
  if (!chatId) return;
  const data = q.data || '';
  if (data === 'h') return show(chatId, null, q.message.message_id);
  const m = /^n(\d+)$/.exec(data);
  const node = m ? nodes[Number(m[1])] : undefined;
  if (node) return show(chatId, node, q.message.message_id);
}

let running = true;
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { running = false; console.log('Arrêt…'); process.exit(0); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await call('setMyCommands', { commands: [{ command: 'start', description: L.home }] }).catch(() => {});
  console.log('Bot démarré : ' + DATA.name);
  let offset = 0;
  while (running) {
    try {
      const updates = await call('getUpdates', { offset, timeout: 25, allowed_updates: ['message', 'callback_query'] });
      for (const u of updates) {
        offset = u.update_id + 1;
        try {
          if (u.message) await onMessage(u.message);
          else if (u.callback_query) await onCallback(u.callback_query);
        } catch (e) { console.error('Erreur de traitement :', e.message); }
      }
    } catch (e) {
      console.error('Erreur Telegram :', e.message);
      await sleep(3000);
    }
  }
}
main();
`;

export function botScript(bot: BotProject): string {
  const data = {
    name: bot.name,
    welcome: bot.welcome,
    columns: bot.columns,
    backButton: bot.backButton,
    labels: BOT_LABELS[bot.lang] ?? BOT_LABELS.fr,
    nodes: bot.nodes,
  };
  // U+2028/2029 échappés : valides en JSON mais pas dans tous les moteurs JS.
  const json = JSON.stringify(data, null, 2).replace(new RegExp("\\u2028", "g"), "\\u2028").replace(new RegExp("\\u2029", "g"), "\\u2029");
  return RUNTIME.replace("__DATA__", () => json);
}

export function botFiles(bot: BotProject): Record<string, string> {
  const slug = slugify(bot.name);
  return {
    "bot.mjs": botScript(bot),
    "package.json": `${JSON.stringify({ name: slug, version: "1.0.0", private: true, type: "module", scripts: { start: "node bot.mjs" }, engines: { node: ">=18" } }, null, 2)}\n`,
    ".env.example": "# Token donné par @BotFather\nBOT_TOKEN=\n# Optionnel : ton identifiant Telegram (écris à @userinfobot) pour recevoir les messages des nœuds « question »\nADMIN_CHAT_ID=\n",
    "README.md": `# ${bot.name || "Mon bot"}

Bot Telegram généré avec AppForge. Aucune installation de paquet n'est nécessaire.

## Lancer

1. Sur Telegram, écris à **@BotFather**, tape \`/newbot\` et copie le token.
2. (Optionnel) Pour recevoir les messages des nœuds « question », écris à **@userinfobot** et copie ton identifiant.
3. Lance :

\`\`\`bash
BOT_TOKEN="ton_token" ADMIN_CHAT_ID="ton_id" node bot.mjs
\`\`\`

Node.js 18 ou plus est requis. Pour le garder allumé : un VPS, Railway, Render, Fly.io, ou \`pm2 start bot.mjs\`.
`,
  };
}
