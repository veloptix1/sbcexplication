import { useMemo, useState, type Dispatch } from "react";
import { BOT_LABELS, botView, type Button } from "../core/bot.js";
import { BOT_MAX_DEPTH, ROOT, type BotNode, type BotProject, type Project } from "../core/schema.js";
import { safeUrl, uid } from "../core/util.js";
import { Segmented, TextArea, TextInput, Toggle } from "./fields.js";
import type { Action } from "./store.js";

type Panel = "tree" | "inspect" | "phone";
const SETTINGS = "settings";
const TYPE_ICON: Record<BotNode["type"], string> = { message: "💬", link: "🔗", ask: "✉️" };
const TYPE_HINT: Record<BotNode["type"], string> = {
  message: "Affiche un texte. Peut avoir des sous-boutons.",
  link: "Ouvre une adresse web (site, WhatsApp, carte…).",
  ask: "Demande un message à la personne et te le transmet.",
};

function flatten(nodes: BotNode[]): { node: BotNode; depth: number }[] {
  const out: { node: BotNode; depth: number }[] = [];
  const walk = (parent: string, depth: number) => {
    for (const node of nodes.filter((n) => n.parent === parent)) {
      out.push({ node, depth });
      walk(node.id, depth + 1);
    }
  };
  walk(ROOT, 0);
  return out;
}

interface Props {
  bot: BotProject;
  dispatch: Dispatch<Action>;
  toast: (message: string) => void;
}

export function BotEditor({ bot, dispatch, toast }: Props) {
  const [sel, setSel] = useState<string>(SETTINGS);
  const [panel, setPanel] = useState<Panel>("tree");

  const edit = (fn: (b: BotProject) => BotProject, key?: string) =>
    dispatch({ type: "edit", fn: (p: Project) => (p.kind === "bot" ? fn(p) : p), ...(key ? { key } : {}), now: Date.now() });
  const patchNodes = (fn: (nodes: BotNode[]) => BotNode[], key?: string) => edit((b) => ({ ...b, nodes: fn(b.nodes) }), key);
  const patchNode = (id: string, patch: Partial<BotNode>, key?: string) => patchNodes((nodes) => nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)), key);

  const rows = useMemo(() => flatten(bot.nodes), [bot.nodes]);
  const selected = bot.nodes.find((n) => n.id === sel);

  const addNode = (parent: string) => {
    if (bot.nodes.length >= 80) return toast("Un bot peut avoir 80 boutons au maximum.");
    const node: BotNode = { id: uid(), parent, label: "Nouveau bouton", type: "message", text: "", url: "" };
    patchNodes((nodes) => [...nodes, node]);
    setSel(node.id);
    setPanel("inspect");
  };
  const removeNode = (id: string) => {
    const doomed = new Set([id]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const n of bot.nodes) if (!doomed.has(n.id) && doomed.has(n.parent)) (doomed.add(n.id), (grew = true));
    }
    if (doomed.size > 1 && !window.confirm(`Supprimer ce bouton et ses ${doomed.size - 1} sous-bouton(s) ?`)) return;
    patchNodes((nodes) => nodes.filter((n) => !doomed.has(n.id)));
    if (doomed.has(sel)) setSel(SETTINGS);
  };
  const moveNode = (id: string, d: -1 | 1) =>
    patchNodes((nodes) => {
      const me = nodes.find((n) => n.id === id);
      if (!me) return nodes;
      const sibs = nodes.map((n, i) => [n, i] as const).filter(([n]) => n.parent === me.parent);
      const pos = sibs.findIndex(([n]) => n.id === id);
      const other = sibs[pos + d];
      const mine = sibs[pos];
      if (!other || !mine) return nodes;
      const next = [...nodes];
      next[mine[1]] = other[0];
      next[other[1]] = mine[0];
      return next;
    });
  const setType = (n: BotNode, type: BotNode["type"]) => {
    const hasKids = bot.nodes.some((k) => k.parent === n.id);
    patchNodes((nodes) => nodes.map((x) => (x.id === n.id ? { ...x, type } : type !== "message" && x.parent === n.id ? { ...x, parent: n.parent } : x)));
    if (type !== "message" && hasKids) toast("Les sous-boutons ont été remontés d'un niveau.");
  };

  return (
    <div className="ed" data-panel={panel}>
      <aside className="pane pane-blocks" aria-label="Menu du bot">
        <div className="pane-head">
          <h2>Menu du bot <span className="count">{bot.nodes.length}</span></h2>
          <button type="button" className={`mini ${sel === SETTINGS ? "on" : ""}`} onClick={() => { setSel(SETTINGS); setPanel("inspect"); }}>Réglages</button>
        </div>
        {rows.length === 0 ? <p className="empty small">Le menu est vide. Ajoute un premier bouton.</p> : null}
        <ol className="blocks tree">
          {rows.map(({ node, depth }) => (
            <li key={node.id} className={node.id === sel ? "on" : ""} style={{ paddingLeft: depth * 14 }}>
              <button type="button" className="block-main" aria-current={node.id === sel} onClick={() => { setSel(node.id); setPanel("inspect"); }}>
                <span className="block-ico" aria-hidden="true">{TYPE_ICON[node.type]}</span>
                <span className="block-text"><strong>{node.label}</strong></span>
              </button>
              <div className="block-tools">
                <button type="button" className="icon" aria-label="Monter" onClick={() => moveNode(node.id, -1)}>↑</button>
                <button type="button" className="icon" aria-label="Descendre" onClick={() => moveNode(node.id, 1)}>↓</button>
                {node.type === "message" && depth < BOT_MAX_DEPTH - 1 ? <button type="button" className="icon" aria-label="Ajouter un sous-bouton" onClick={() => addNode(node.id)}>＋</button> : null}
                <button type="button" className="icon danger" aria-label="Supprimer" onClick={() => removeNode(node.id)}>✕</button>
              </div>
            </li>
          ))}
        </ol>
        <button type="button" className="btn ghost wide" onClick={() => addNode(ROOT)}>+ Ajouter un bouton au menu principal</button>
      </aside>

      <section className="pane pane-inspect" aria-label="Réglages">
        {selected ? (
          <>
            <div className="pane-head"><h2>{TYPE_ICON[selected.type]} Bouton</h2></div>
            <TextInput label="Texte du bouton" hint="Visible sur le bouton dans Telegram (60 caractères au plus)." value={selected.label} max={60} onChange={(v) => patchNode(selected.id, { label: v }, `n:${selected.id}:l`)} />
            <Segmented label="Ce bouton…" value={selected.type} options={[["message", "Répond"], ["link", "Ouvre un lien"], ["ask", "Pose une question"]]} onChange={(t) => setType(selected, t)} />
            <p className="hint tight">{TYPE_HINT[selected.type]}</p>
            {selected.type === "link" ? (
              <TextInput label="Adresse du lien" type="url" value={selected.url} placeholder="https://wa.me/237600000000" hint="Doit commencer par https://" onChange={(v) => patchNode(selected.id, { url: v }, `n:${selected.id}:u`)} />
            ) : (
              <TextArea label={selected.type === "ask" ? "Consigne affichée à la personne" : "Réponse du bot"} rows={7} max={3500} value={selected.text} onChange={(v) => patchNode(selected.id, { text: v }, `n:${selected.id}:t`)} />
            )}
            {selected.type === "ask" ? <p className="hint">Le message est envoyé à ton compte Telegram si tu renseignes ADMIN_CHAT_ID au lancement du bot.</p> : null}
          </>
        ) : (
          <>
            <div className="pane-head"><h2>Réglages du bot</h2></div>
            <TextInput label="Nom du bot" value={bot.name} max={80} onChange={(v) => edit((b) => ({ ...b, name: v }), "bot:name")} />
            <TextArea label="Message d'accueil" hint="Affiché avec le menu principal quand quelqu'un écrit /start." rows={4} max={1500} value={bot.welcome} onChange={(v) => edit((b) => ({ ...b, welcome: v }), "bot:welcome")} />
            <Segmented label="Langue des boutons Retour et Menu" value={bot.lang} options={[["fr", "Français"], ["en", "English"]]} onChange={(lang) => edit((b) => ({ ...b, lang }))} />
            <Segmented label="Boutons par ligne" value={String(bot.columns) as "1" | "2"} options={[["1", "Un"], ["2", "Deux"]]} onChange={(v) => edit((b) => ({ ...b, columns: v === "2" ? 2 : 1 }))} />
            <Toggle label="Afficher un bouton Retour dans les sous-menus" checked={bot.backButton} onChange={(v) => edit((b) => ({ ...b, backButton: v }))} />
          </>
        )}
      </section>

      <section className="pane pane-preview" aria-label="Simulateur Telegram">
        <Simulator bot={bot} />
        <details className="howto">
          <summary>Comment mettre le bot en ligne</summary>
          <ol>
            <li>Sur Telegram, écris à <b>@BotFather</b>, envoie <code>/newbot</code> et copie le token.</li>
            <li>Télécharge le bot (menu Exporter), décompresse-le.</li>
            <li>Lance <code>BOT_TOKEN="ton_token" node bot.mjs</code>. Node.js 18 ou plus suffit.</li>
          </ol>
        </details>
      </section>

      <nav className="tabs" aria-label="Panneaux">
        {([["tree", "Menu"], ["inspect", "Modifier"], ["phone", "Simulateur"]] as const).map(([k, label]) => (
          <button key={k} type="button" aria-pressed={panel === k} onClick={() => setPanel(k)}>{label}</button>
        ))}
      </nav>
    </div>
  );
}

function Simulator({ bot }: { bot: BotProject }) {
  const [cur, setCur] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const node = cur ? bot.nodes.find((n) => n.id === cur) : undefined;
  const view = botView(bot, node?.id ?? null);
  const L = BOT_LABELS[bot.lang] ?? BOT_LABELS.fr;
  const home = botView(bot, null);

  const press = (b: Button) => {
    if (!("callback_data" in b)) return;
    setSaid(null);
    if (b.callback_data === "h") return setCur(null);
    const target = bot.nodes[Number(b.callback_data.slice(1))];
    if (target) setCur(target.id);
  };

  const Keyboard = ({ rows, active }: { rows: Button[][]; active: boolean }) => (
    <div className="kb">
      {rows.map((row, i) => (
        <div key={i} className="kb-row">
          {row.map((b) =>
            "url" in b ? (
              <a key={b.text} href={safeUrl(b.url)} target="_blank" rel="noopener noreferrer">{b.text} ↗</a>
            ) : (
              <button key={b.text} type="button" disabled={!active} onClick={() => press(b)}>{b.text}</button>
            ),
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div className="phone">
      <div className="phone-head">
        <span className="avatar" aria-hidden="true">{(bot.name || "B").slice(0, 1).toUpperCase()}</span>
        <span><strong>{bot.name || "Mon bot"}</strong><small>bot</small></span>
        <button type="button" className="mini on-dark" onClick={() => { setCur(null); setSaid(null); setDraft(""); }}>Redémarrer</button>
      </div>
      <div className="chat" aria-live="polite">
        <div className="bubble bot">
          <p>{view.text}</p>
          <Keyboard rows={view.keyboard} active={said === null} />
        </div>
        {said !== null ? (
          <>
            <div className="bubble me"><p>{said}</p></div>
            <div className="bubble bot"><p>{L.thanks}</p><Keyboard rows={home.keyboard} active={false} /></div>
          </>
        ) : null}
      </div>
      <form className="composer" onSubmit={(e) => { e.preventDefault(); if (view.awaiting && draft.trim()) { setSaid(draft.trim()); setDraft(""); } }}>
        <input aria-label="Ton message" value={draft} disabled={!view.awaiting || said !== null} placeholder={view.awaiting && said === null ? "Écris ton message…" : "Le bot n'attend pas de message"} onChange={(e) => setDraft(e.target.value)} />
        <button type="submit" disabled={!view.awaiting || said !== null || !draft.trim()}>Envoyer</button>
      </form>
    </div>
  );
}
