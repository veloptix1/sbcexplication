import { useCallback, useEffect, useRef, useState } from "react";
import { Project, StoredProject, normalizeProject, type Project as ProjectT } from "../core/schema.js";
import { Editor, exportProjectJson } from "./Editor.js";
import { Home } from "./Home.js";
import { newId, sortedProjects, useStore } from "./store.js";

export default function App() {
  const [state, dispatch] = useStore();
  const [message, setMessage] = useState("");
  const timer = useRef<number | undefined>(undefined);
  const cur = state.currentId ? state.projects[state.currentId] : undefined;

  const toast = useCallback((m: string) => {
    setMessage(m);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMessage(""), 3500);
  }, []);

  // Ctrl/Cmd+Z : annuler, avec Maj : rétablir (hors champs de saisie, qui ont leur propre historique)
  useEffect(() => {
    if (!cur) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === "z") { e.preventDefault(); dispatch({ type: e.shiftKey ? "redo" : "undo", now: Date.now() }); }
      else if (k === "y") { e.preventDefault(); dispatch({ type: "redo", now: Date.now() }); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cur, dispatch]);

  const create = (project: ProjectT) => dispatch({ type: "create", id: newId(), project, now: Date.now() });

  const importFile = async (file: File) => {
    try {
      const data: unknown = JSON.parse(await file.text());
      const stored = StoredProject.safeParse(data);
      const project = stored.success ? stored.data.project : Project.safeParse(data).data;
      if (!project) throw new Error("format");
      create(normalizeProject(project));
      toast("Projet importé.");
    } catch {
      toast("Ce fichier n'est pas un projet AppForge valide.");
    }
  };

  return (
    <>
      {cur ? (
        <Editor stored={cur} canUndo={state.past.length > 0} canRedo={state.future.length > 0} dispatch={dispatch} toast={toast} onClose={() => dispatch({ type: "open", id: null })} />
      ) : (
        <Home
          projects={sortedProjects(state)}
          onCreate={create}
          onOpen={(id) => dispatch({ type: "open", id })}
          onRemove={(id) => dispatch({ type: "remove", id })}
          onDuplicate={(id) => dispatch({ type: "duplicate", id, newId: newId(), now: Date.now() })}
          onExport={exportProjectJson}
          onImport={(f) => void importFile(f)}
        />
      )}
      <div className="toast" role="status" aria-live="polite">{message}</div>
    </>
  );
}
