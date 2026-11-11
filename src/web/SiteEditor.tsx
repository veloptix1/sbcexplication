import { useDeferredValue, useMemo, useState, type Dispatch } from "react";
import { BLOCK_META, BLOCK_ORDER } from "../core/blocks.js";
import { THEMES, renderSite } from "../core/render-site.js";
import { THEME_IDS, type Block, type BlockType, type SiteLike, type SiteSettings } from "../core/schema.js";
import { uid } from "../core/util.js";
import { BlockForm, blockSummary } from "./blockForms.js";
import { Segmented, Select, TextArea, TextInput } from "./fields.js";
import { openHtml, previewHtml } from "./files.js";
import { siteEdit, type Action } from "./store.js";

const ACCENTS = ["#4b3fd1", "#2f3fb8", "#0f766e", "#15803d", "#a16207", "#c2410c", "#b91c1c", "#db2777"];
type Panel = "blocks" | "inspect" | "preview";

interface Props {
  project: SiteLike;
  dispatch: Dispatch<Action>;
}

export function SiteEditor({ project, dispatch }: Props) {
  const [sel, setSel] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>("blocks");
  const [device, setDevice] = useState<"mobile" | "desktop">(project.kind === "page" || window.matchMedia("(max-width: 979px)").matches ? "mobile" : "desktop");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const edit = (fn: (p: SiteLike) => SiteLike, key?: string) => dispatch({ type: "edit", fn: siteEdit(fn), ...(key ? { key } : {}), now: Date.now() });
  const patchBlocks = (fn: (blocks: Block[]) => Block[], key?: string) => edit((p) => ({ ...p, blocks: fn(p.blocks) }), key);
  const patchSettings = (patch: Partial<SiteSettings>, key?: string) => edit((p) => ({ ...p, settings: { ...p.settings, ...patch } }), key);

  const selected = project.blocks.find((b) => b.id === sel) ?? null;

  const add = (type: BlockType) => {
    const block = BLOCK_META[type].make();
    patchBlocks((blocks) => {
      const at = sel ? blocks.findIndex((b) => b.id === sel) + 1 : 0;
      const i = at > 0 ? at : blocks.length;
      return [...blocks.slice(0, i), block, ...blocks.slice(i)];
    });
    setSel(block.id);
    setPanel("inspect");
  };
  const remove = (id: string) => {
    patchBlocks((blocks) => blocks.filter((b) => b.id !== id));
    if (sel === id) setSel(null);
  };
  const duplicate = (id: string) => {
    const copyId = uid();
    patchBlocks((blocks) => {
      const i = blocks.findIndex((b) => b.id === id);
      const src = blocks[i];
      return src ? [...blocks.slice(0, i + 1), { ...structuredClone(src), id: copyId } as Block, ...blocks.slice(i + 1)] : blocks;
    });
    setSel(copyId);
  };
  const move = (from: number, to: number) =>
    patchBlocks((blocks) => {
      if (to < 0 || to >= blocks.length || from === to) return blocks;
      const next = [...blocks];
      const [item] = next.splice(from, 1);
      if (item) next.splice(to, 0, item);
      return next;
    });
  const updateBlock = (id: string, patch: Record<string, unknown>, key: string) =>
    patchBlocks((blocks) => blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as Block) : b)), key ? `blk:${key}` : undefined);

  const deferred = useDeferredValue(project);
  const html = useMemo(() => previewHtml(renderSite(deferred)), [deferred]);

  return (
    <div className="ed" data-panel={panel}>
      <aside className="pane pane-blocks" aria-label="Blocs de la page">
        <div className="pane-head">
          <h2>Blocs <span className="count">{project.blocks.length}</span></h2>
        </div>
        {project.blocks.length === 0 ? <p className="empty small">La page est vide. Ajoute un premier bloc ci-dessous.</p> : null}
        <ol className="blocks">
          {project.blocks.map((b, i) => (
            <li
              key={b.id}
              className={`${b.id === sel ? "on" : ""} ${overId === b.id && dragId !== b.id ? "over" : ""}`}
              draggable
              onDragStart={(e) => { setDragId(b.id); e.dataTransfer.effectAllowed = "move"; }}
              onDragOver={(e) => { e.preventDefault(); setOverId(b.id); }}
              onDragEnd={() => { setDragId(null); setOverId(null); }}
              onDrop={(e) => {
                e.preventDefault();
                const from = project.blocks.findIndex((x) => x.id === dragId);
                if (from >= 0) move(from, i);
                setDragId(null);
                setOverId(null);
              }}
            >
              <button type="button" className="block-main" aria-current={b.id === sel} onClick={() => { setSel(b.id); setPanel("inspect"); }}>
                <span className="block-ico" aria-hidden="true">{BLOCK_META[b.type].icon}</span>
                <span className="block-text">
                  <strong>{BLOCK_META[b.type].label}</strong>
                  <small>{blockSummary(b) || "Vide"}</small>
                </span>
              </button>
              <div className="block-tools">
                <button type="button" className="icon" aria-label="Monter" disabled={i === 0} onClick={() => move(i, i - 1)}>↑</button>
                <button type="button" className="icon" aria-label="Descendre" disabled={i === project.blocks.length - 1} onClick={() => move(i, i + 1)}>↓</button>
                <button type="button" className="icon" aria-label="Dupliquer" onClick={() => duplicate(b.id)}>⧉</button>
                <button type="button" className="icon danger" aria-label="Supprimer" onClick={() => remove(b.id)}>✕</button>
              </div>
            </li>
          ))}
        </ol>
        <details className="palette" open={project.blocks.length < 4}>
          <summary>Ajouter un bloc{sel ? " après la sélection" : ""}</summary>
          <div className="palette-grid">
            {BLOCK_ORDER.map((t) => (
              <button key={t} type="button" onClick={() => add(t)} title={BLOCK_META[t].hint}>
                <span aria-hidden="true">{BLOCK_META[t].icon}</span>
                {BLOCK_META[t].label}
              </button>
            ))}
          </div>
        </details>
      </aside>

      <section className="pane pane-inspect" aria-label="Réglages">
        {selected ? (
          <>
            <div className="pane-head">
              <h2>{BLOCK_META[selected.type].label}</h2>
              <button type="button" className="mini" onClick={() => setSel(null)}>← Réglages</button>
            </div>
            <BlockForm block={selected} onChange={(patch, key) => updateBlock(selected.id, patch, key)} />
          </>
        ) : (
          <SettingsForm project={project} onName={(name) => edit((p) => ({ ...p, name }), "name")} onChange={patchSettings} />
        )}
      </section>

      <section className="pane pane-preview" aria-label="Aperçu">
        <div className="preview-bar">
          <div className="seg on-dark small" role="group" aria-label="Taille de l'aperçu">
            <button type="button" aria-pressed={device === "mobile"} onClick={() => setDevice("mobile")}>Téléphone</button>
            <button type="button" aria-pressed={device === "desktop"} onClick={() => setDevice("desktop")}>Ordinateur</button>
          </div>
          <button type="button" className="btn quiet" onClick={() => openHtml(renderSite(project))}>Ouvrir dans un onglet</button>
        </div>
        <div className={`frame ${device}`}>
          <iframe title="Aperçu de la page" srcDoc={html} sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" />
        </div>
      </section>

      <nav className="tabs" aria-label="Panneaux">
        {([["blocks", "Blocs"], ["inspect", selected ? "Modifier" : "Réglages"], ["preview", "Aperçu"]] as const).map(([k, label]) => (
          <button key={k} type="button" aria-pressed={panel === k} onClick={() => setPanel(k)}>{label}</button>
        ))}
      </nav>
    </div>
  );
}

function SettingsForm({ project, onName, onChange }: { project: SiteLike; onName: (n: string) => void; onChange: (patch: Partial<SiteSettings>, key?: string) => void }) {
  const s = project.settings;
  return (
    <>
      <div className="pane-head"><h2>{project.kind === "page" ? "Réglages de la page" : "Réglages du site"}</h2></div>
      <TextInput label="Nom du projet" hint="Visible seulement dans AppForge." value={project.name} max={80} onChange={onName} />
      <TextInput label="Titre de l'onglet" hint="Affiché dans l'onglet du navigateur et sur Google." value={s.title} max={120} onChange={(v) => onChange({ title: v }, "s:title")} />
      <TextArea label="Description pour Google" rows={3} value={s.description} max={300} onChange={(v) => onChange({ description: v }, "s:description")} />
      <Segmented label="Langue de la page" value={s.lang} options={[["fr", "Français"], ["en", "English"]]} onChange={(lang) => onChange({ lang })} />
      <div className="field" role="group" aria-label="Thème">
        <span className="label">Thème</span>
        <div className="themes">
          {THEME_IDS.map((id) => {
            const t = THEMES[id];
            return (
              <button key={id} type="button" aria-pressed={s.theme === id} onClick={() => onChange({ theme: id })}>
                <span className="sw" style={{ background: t.bg, borderColor: t.line }}><i style={{ background: t.surface, borderColor: t.line }} /><i style={{ background: t.text }} /></span>
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="field" role="group" aria-label="Couleur principale">
        <span className="label">Couleur principale</span>
        <div className="accents">
          {ACCENTS.map((c) => (
            <button key={c} type="button" className="dot" style={{ background: c }} aria-label={c} aria-pressed={s.accent.toLowerCase() === c} onClick={() => onChange({ accent: c })} />
          ))}
          <input type="color" aria-label="Autre couleur" value={s.accent} onChange={(e) => onChange({ accent: e.target.value }, "s:accent")} />
        </div>
      </div>
      <Segmented label="Coins" value={s.radius} options={[["sm", "Droits"], ["md", "Arrondis"], ["lg", "Très ronds"]]} onChange={(radius) => onChange({ radius })} />
      <Select label="Police" value={s.font} options={[["sans", "Moderne"], ["serif", "Classique"], ["rounded", "Douce"], ["mono", "Technique"]]} onChange={(font) => onChange({ font })} />
      <TextInput label="Icône de l'onglet" hint="Un emoji." value={s.emoji} max={8} onChange={(v) => onChange({ emoji: v }, "s:emoji")} />
      <TextInput label="Bouton WhatsApp flottant" hint="Numéro avec indicatif (237600000000). Laisse vide pour le masquer." type="tel" value={s.whatsappFloat} onChange={(v) => onChange({ whatsappFloat: v }, "s:wa")} />
    </>
  );
}
