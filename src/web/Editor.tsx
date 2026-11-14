import { useEffect, useRef, useState, type Dispatch } from "react";
import { botFiles, botScript } from "../core/bot.js";
import { renderSite } from "../core/render-site.js";
import { isPageLike, type Project, type StoredProject } from "../core/schema.js";
import { slugify } from "../core/util.js";
import { BotEditor } from "./BotEditor.js";
import { copyText, downloadText, downloadZip } from "./files.js";
import { KIND_LABEL, Logo } from "./Home.js";
import { CatalogEditor, ShopSettings } from "./AppPanels.js";
import { PublishDialog } from "./PublishDialog.js";
import { SiteEditor } from "./SiteEditor.js";
import type { Action } from "./store.js";
import { useGenerate } from "./useGenerate.js";

interface Props {
  stored: StoredProject;
  canUndo: boolean;
  canRedo: boolean;
  dispatch: Dispatch<Action>;
  toast: (message: string) => void;
  onClose: () => void;
}

export function exportProjectJson(s: StoredProject): void {
  downloadText(`${slugify(s.project.name)}.appforge.json`, JSON.stringify(s, null, 2), "application/json");
}

export function Editor({ stored, canUndo, canRedo, dispatch, toast, onClose }: Props) {
  const project = stored.project;
  const [aiOpen, setAiOpen] = useState(false);
  const [pubOpen, setPubOpen] = useState(false);
  const [section, setSection] = useState<"home" | "catalog" | "shop">("home");
  const slug = slugify(project.name);

  return (
    <div className="editor">
      <header className="topbar">
        <button type="button" className="btn quiet back" onClick={onClose} aria-label="Retour à mes projets">← <span className="hide-xs">Projets</span></button>
        <span className="logo-sm"><Logo /></span>
        <span className={`kind-tag ${project.kind}`}>{KIND_LABEL[project.kind]}</span>
        <input className="name" aria-label="Nom du projet" value={project.name} maxLength={80} onChange={(e) => dispatch({ type: "edit", fn: (p) => ({ ...p, name: e.target.value }) as Project, key: "name", now: Date.now() })} />
        <div className="spacer" />
        <button type="button" className="icon bar" aria-label="Annuler" title="Annuler (Ctrl+Z)" disabled={!canUndo} onClick={() => dispatch({ type: "undo", now: Date.now() })}>↶</button>
        <button type="button" className="icon bar" aria-label="Rétablir" title="Rétablir (Ctrl+Maj+Z)" disabled={!canRedo} onClick={() => dispatch({ type: "redo", now: Date.now() })}>↷</button>
        <button type="button" className="btn ghost-dark" onClick={() => setAiOpen(true)}>✨ <span className="hide-sm">Refaire avec l'IA</span></button>
        {isPageLike(project) ? <button type="button" className="btn primary" onClick={() => setPubOpen(true)}>{project.publication ? "Publier ▲" : "Publier"}</button> : null}
        <Menu label="Exporter">
          {project.kind === "site" || project.kind === "page" ? (
            <>
              <button type="button" onClick={() => { downloadText(`${slug}.html`, renderSite(project), "text/html"); toast("Fichier HTML téléchargé."); }}>Télécharger la page (.html)</button>
              <button type="button" onClick={async () => toast((await copyText(renderSite(project))) ? "Code HTML copié." : "Copie impossible sur ce navigateur.")}>Copier le code HTML</button>
            </>
          ) : project.kind === "bot" ? (
            <>
              <button type="button" onClick={() => { downloadZip(`${slug}.zip`, botFiles(project)); toast("Bot téléchargé. Le README explique le lancement."); }}>Télécharger le bot (.zip)</button>
              <button type="button" onClick={async () => toast((await copyText(botScript(project))) ? "Code du bot copié." : "Copie impossible sur ce navigateur.")}>Copier bot.mjs</button>
            </>
          ) : null}
          <button type="button" onClick={() => exportProjectJson(stored)}>Sauvegarder le projet (.json)</button>
        </Menu>
      </header>

      {project.kind === "app" ? (
        <nav className="subtabs" aria-label="Sections de l'application">
          {([["home", "Accueil"], ["catalog", `Catalogue (${project.products.length})`], ["shop", "Paiement et livraison"]] as const).map(([k, label]) => (
            <button key={k} type="button" aria-pressed={section === k} onClick={() => setSection(k)}>{label}</button>
          ))}
        </nav>
      ) : null}
      {project.kind === "app" && section === "catalog" ? <CatalogEditor project={project} dispatch={dispatch} /> : null}
      {project.kind === "app" && section === "shop" ? <ShopSettings project={project} dispatch={dispatch} /> : null}
      {isPageLike(project) && (project.kind !== "app" || section === "home") ? <SiteEditor key={stored.id} project={project} dispatch={dispatch} /> : project.kind === "bot" ? <BotEditor key={stored.id} bot={project} dispatch={dispatch} toast={toast} /> : null}

      {pubOpen && isPageLike(project) ? <PublishDialog project={project} toast={toast} onClose={() => setPubOpen(false)} onPublished={(slug) => dispatch({ type: "edit", fn: (p) => (isPageLike(p) ? { ...p, publication: { slug } } : p), now: Date.now() })} /> : null}

      {aiOpen ? <AiDialog project={project} onClose={() => setAiOpen(false)} onResult={(p) => { dispatch({ type: "edit", fn: () => p, now: Date.now() }); setAiOpen(false); toast("Contenu remplacé. Tu peux annuler avec ↶."); }} /> : null}
    </div>
  );
}

function Menu({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div className="menu" ref={ref}>
      <button type="button" className="btn primary" aria-expanded={open} onClick={() => setOpen(!open)}>{label} ▾</button>
      {open ? <div className="menu-list" onClick={() => setOpen(false)}>{children}</div> : null}
    </div>
  );
}

function AiDialog({ project, onClose, onResult }: { project: Project; onClose: () => void; onResult: (p: Project) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [prompt, setPrompt] = useState("");
  const g = useGenerate();
  useEffect(() => { ref.current?.showModal(); }, []);
  const ready = prompt.trim().length >= 5 && g.canGenerate && !g.busy;
  const lang = project.kind === "bot" ? project.lang : isPageLike(project) ? project.settings.lang : "fr";
  const go = async () => { const p = await g.run(project.kind, prompt.trim(), lang); if (p) onResult(p); };
  return (
    <dialog ref={ref} className="dialog" onClose={onClose} onCancel={(e) => { if (g.busy) e.preventDefault(); }}>
      <form method="dialog" onSubmit={(e) => { e.preventDefault(); if (ready) void go(); }}>
        <h2>Refaire avec l'IA</h2>
        <p className="hint">Décris la nouvelle version. Elle remplace le contenu actuel, et tu peux annuler ensuite.</p>
        <label htmlFor="ai-prompt" className="sr">Description</label>
        <textarea id="ai-prompt" rows={5} autoFocus value={prompt} maxLength={2000} placeholder="Ex : même projet, mais pour un salon de beauté à Yaoundé avec une section avis" onChange={(e) => setPrompt(e.target.value)} />
        {g.health?.protected ? (
          <div className="field"><label htmlFor="ai-code">Code d'accès</label><input id="ai-code" type="password" autoComplete="off" value={g.code} onChange={(e) => g.setCode(e.target.value)} /></div>
        ) : null}
        {g.busy ? <p className="notice light" role="status">Création en cours, 20 à 40 secondes…</p> : null}
        {g.error ? <p className="notice light error" role="alert">{g.error}</p> : null}
        {!g.busy && !g.error && g.status ? <p className="notice light">{g.status}</p> : null}
        <div className="dialog-actions">
          <button type="button" className="btn ghost" disabled={g.busy} onClick={() => ref.current?.close()}>Annuler</button>
          <button type="submit" className="btn solid" disabled={!ready}>{g.busy ? "Création…" : "Remplacer le contenu"}</button>
        </div>
      </form>
    </dialog>
  );
}
