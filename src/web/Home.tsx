import { useRef, useState } from "react";
import type { Project, ProjectKind, StoredProject } from "../core/schema.js";
import { TEMPLATES, blankProject, templatesFor, type Template } from "../core/templates.js";
import { Thumb } from "./Thumb.js";
import { useGenerate } from "./useGenerate.js";

export const KIND_LABEL: Record<ProjectKind, string> = { site: "Site web", page: "Page mobile", bot: "Bot Telegram" };
const KIND_BLURB: Record<ProjectKind, string> = {
  site: "Plusieurs sections, adapté au téléphone",
  page: "Une page courte : liens, catalogue, commande",
  bot: "Menus, réponses et messages vers toi",
};
const EXAMPLES: Record<ProjectKind, string[]> = {
  site: ["Site pour mon salon de coiffure à Douala avec tarifs et bouton WhatsApp", "Page de vente de ma formation en marketing digital", "Site d'un restaurant à Abidjan avec menu et réservation"],
  page: ["Page de liens pour ma boutique de vêtements", "Mini-catalogue de mes jus naturels avec commande WhatsApp"],
  bot: ["Bot qui présente mes formations et prend les inscriptions", "Bot pour ma boutique de téléphones : catalogue, prix et commande"],
};

const cache = new Map<string, Project>();
const sample = (t: Template): Project => {
  let p = cache.get(t.id);
  if (!p) cache.set(t.id, (p = t.build()));
  return p;
};

const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
function ago(ts: number): string {
  const s = Math.round((ts - Date.now()) / 1000);
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [["day", 86400], ["hour", 3600], ["minute", 60]];
  for (const [unit, size] of steps) if (Math.abs(s) >= size) return rtf.format(Math.round(s / size), unit);
  return "à l'instant";
}

export function Logo() {
  return (
    <span className="brand">
      <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="#ffb000" />
        <path d="M9 22l7-13 7 13h-4l-3-6-3 6z" fill="#1b1f4b" />
      </svg>
      <span>AppForge</span>
    </span>
  );
}

interface HomeProps {
  projects: StoredProject[];
  onCreate: (p: Project) => void;
  onOpen: (id: string) => void;
  onRemove: (id: string) => void;
  onDuplicate: (id: string) => void;
  onExport: (s: StoredProject) => void;
  onImport: (file: File) => void;
}

export function Home({ projects, onCreate, onOpen, onRemove, onDuplicate, onExport, onImport }: HomeProps) {
  const [kind, setKind] = useState<ProjectKind>("site");
  const [lang, setLang] = useState<"fr" | "en">("fr");
  const [prompt, setPrompt] = useState("");
  const g = useGenerate();
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = async () => {
    const project = await g.run(kind, prompt.trim(), lang);
    if (project) onCreate(project);
  };
  const ready = prompt.trim().length >= 5 && g.canGenerate && !g.busy;

  return (
    <div className="home">
      <header className="hero-band">
        <div className="wrap">
          <nav className="topnav">
            <Logo />
            <button type="button" className="btn quiet" onClick={() => fileRef.current?.click()}>Importer un projet</button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ""; }} />
          </nav>

          <h1>Décris ce que tu veux créer.</h1>
          <form className="prompt" onSubmit={(e) => { e.preventDefault(); if (ready) void submit(); }}>
            <label htmlFor="prompt" className="sr">Description du projet</label>
            <textarea id="prompt" rows={3} value={prompt} maxLength={2000} placeholder={EXAMPLES[kind][0]} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && ready) void submit(); }} />
            <div className="prompt-bar">
              <div className="seg on-dark" role="group" aria-label="Type de projet">
                {(Object.keys(KIND_LABEL) as ProjectKind[]).map((k) => (
                  <button key={k} type="button" aria-pressed={k === kind} onClick={() => setKind(k)} title={KIND_BLURB[k]}>{KIND_LABEL[k]}</button>
                ))}
              </div>
              <div className="seg on-dark small" role="group" aria-label="Langue du projet">
                {(["fr", "en"] as const).map((l) => (
                  <button key={l} type="button" aria-pressed={l === lang} onClick={() => setLang(l)}>{l === "fr" ? "Français" : "English"}</button>
                ))}
              </div>
              <button type="submit" className="btn primary" disabled={!ready}>{g.busy ? "Création en cours…" : "Créer avec l'IA"}</button>
            </div>
          </form>

          <p className="kind-blurb">{KIND_BLURB[kind]}.</p>
          <div className="examples" aria-label="Exemples">
            {EXAMPLES[kind].map((ex) => (
              <button key={ex} type="button" onClick={() => setPrompt(ex)}>{ex}</button>
            ))}
          </div>
          {g.health?.protected ? (
            <div className="code-row">
              <label htmlFor="code">Code d'accès</label>
              <input id="code" type="password" autoComplete="off" value={g.code} onChange={(e) => g.setCode(e.target.value)} />
            </div>
          ) : null}
          {g.busy ? <p className="notice" role="status">L'IA rédige ton projet. Cela prend en général 20 à 40 secondes.</p> : null}
          {g.error ? <p className="notice error" role="alert">{g.error}</p> : null}
          {!g.busy && !g.error && g.status ? <p className="notice">{g.status}</p> : null}
        </div>
        <div className="cloth" aria-hidden="true" />
      </header>

      <main className="wrap">
        <section aria-labelledby="tpl">
          <h2 id="tpl">Ou pars d'un modèle</h2>
          <p className="section-sub">Modifie tout ensuite : textes, couleurs, sections.</p>
          <ul className="tiles">
            <li>
              <button type="button" className="tile" onClick={() => onCreate(blankProject(kind))}>
                <span className="thumb blank" aria-hidden="true">+</span>
                <strong>Projet vide</strong>
                <span>Commence de zéro</span>
              </button>
            </li>
            {templatesFor(kind).map((t) => (
              <li key={t.id}>
                <button type="button" className="tile" onClick={() => onCreate(t.build())}>
                  <Thumb project={sample(t)} accent={t.accent} />
                  <strong>{t.name}</strong>
                  <span>{t.blurb}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="mine">
          <h2 id="mine">Mes projets</h2>
          {projects.length === 0 ? (
            <p className="empty">Aucun projet pour l'instant. Décris une idée ci-dessus ou choisis un modèle : tes projets sont enregistrés sur cet appareil.</p>
          ) : (
            <ul className="projects">
              {projects.map((s) => (
                <li key={s.id}>
                  <button type="button" className="proj-main" onClick={() => onOpen(s.id)}>
                    <span className={`kind-tag ${s.project.kind}`}>{KIND_LABEL[s.project.kind]}</span>
                    <strong>{s.project.name || "Sans titre"}</strong>
                    <time dateTime={new Date(s.updatedAt).toISOString()}>{ago(s.updatedAt)}</time>
                  </button>
                  <div className="proj-actions">
                    <button type="button" className="mini" onClick={() => onDuplicate(s.id)}>Dupliquer</button>
                    <button type="button" className="mini" onClick={() => onExport(s)}>Exporter</button>
                    <button type="button" className="mini danger" onClick={() => { if (window.confirm(`Supprimer « ${s.project.name || "Sans titre"} » ? Cette action est définitive.`)) onRemove(s.id); }}>Supprimer</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        <footer className="foot">{TEMPLATES.length} modèles · Tes projets restent dans ce navigateur · Exporte-les pour les garder ailleurs.</footer>
      </main>
    </div>
  );
}
