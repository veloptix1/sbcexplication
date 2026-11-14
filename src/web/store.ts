import { useEffect, useReducer, type Dispatch } from "react";
import { StoredProject, isPageLike, normalizeProject, type AppProject, type PageLike, type Project } from "../core/schema.js";
import { uid } from "../core/util.js";

const KEY = "appforge:v1";
const HISTORY_LIMIT = 80;
/** Deux frappes du même champ à moins d'une seconde comptent pour une seule étape d'annulation. */
const COALESCE_MS = 1000;

export interface State {
  projects: Record<string, StoredProject>;
  currentId: string | null;
  past: Project[];
  future: Project[];
  lastKey: string;
  lastAt: number;
}

export type Action =
  | { type: "create"; id: string; project: Project; now: number }
  | { type: "open"; id: string | null }
  | { type: "edit"; fn: (p: Project) => Project; key?: string; now: number }
  | { type: "undo"; now: number }
  | { type: "redo"; now: number }
  | { type: "remove"; id: string }
  | { type: "duplicate"; id: string; newId: string; now: number };

const empty: State = { projects: {}, currentId: null, past: [], future: [], lastKey: "", lastAt: 0 };

export function reducer(state: State, action: Action): State {
  const cur = state.currentId ? state.projects[state.currentId] : undefined;
  switch (action.type) {
    case "create":
      return {
        ...empty,
        projects: { ...state.projects, [action.id]: { id: action.id, updatedAt: action.now, project: action.project } },
        currentId: action.id,
      };
    case "open":
      return { ...state, currentId: action.id, past: [], future: [], lastKey: "", lastAt: 0 };
    case "edit": {
      if (!cur) return state;
      const next = action.fn(cur.project);
      if (next === cur.project) return state;
      const merge = Boolean(action.key) && action.key === state.lastKey && action.now - state.lastAt < COALESCE_MS;
      return {
        ...state,
        projects: { ...state.projects, [cur.id]: { ...cur, project: next, updatedAt: action.now } },
        past: merge ? state.past : [...state.past, cur.project].slice(-HISTORY_LIMIT),
        future: [],
        lastKey: action.key ?? "",
        lastAt: action.now,
      };
    }
    case "undo": {
      const previous = state.past.at(-1);
      if (!cur || !previous) return state;
      return {
        ...state,
        projects: { ...state.projects, [cur.id]: { ...cur, project: previous, updatedAt: action.now } },
        past: state.past.slice(0, -1),
        future: [cur.project, ...state.future],
        lastKey: "",
      };
    }
    case "redo": {
      const [next, ...rest] = state.future;
      if (!cur || !next) return state;
      return {
        ...state,
        projects: { ...state.projects, [cur.id]: { ...cur, project: next, updatedAt: action.now } },
        past: [...state.past, cur.project],
        future: rest,
        lastKey: "",
      };
    }
    case "remove": {
      const { [action.id]: _gone, ...rest } = state.projects;
      return { ...state, projects: rest, currentId: state.currentId === action.id ? null : state.currentId, ...(state.currentId === action.id ? { past: [], future: [] } : {}) };
    }
    case "duplicate": {
      const src = state.projects[action.id];
      if (!src) return state;
      const copy = { ...src.project, name: `${src.project.name} (copie)` } as Project;
      return { ...state, projects: { ...state.projects, [action.newId]: { id: action.newId, updatedAt: action.now, project: copy } } };
    }
    default:
      return state;
  }
}

function load(): State {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as { projects?: Record<string, unknown>; currentId?: string | null } | null;
    const projects: Record<string, StoredProject> = {};
    for (const value of Object.values(raw?.projects ?? {})) {
      const parsed = StoredProject.safeParse(value);
      if (parsed.success) projects[parsed.data.id] = { ...parsed.data, project: normalizeProject(parsed.data.project) };
    }
    const currentId = raw?.currentId && projects[raw.currentId] ? raw.currentId : null;
    return { ...empty, projects, currentId };
  } catch {
    return empty;
  }
}

export function useStore(): [State, Dispatch<Action>] {
  const [state, dispatch] = useReducer(reducer, undefined, load);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify({ projects: state.projects, currentId: state.currentId }));
      } catch {
        /* stockage plein ou désactivé : l'app continue en mémoire */
      }
    }, 300);
    return () => clearTimeout(t);
  }, [state.projects, state.currentId]);
  return [state, dispatch];
}

export const newId = uid;
export const sortedProjects = (s: State): StoredProject[] => Object.values(s.projects).sort((a, b) => b.updatedAt - a.updatedAt);

/** Applique une modification à un site, une page ou une application ; ignorée si le projet courant est un bot. */
export const siteEdit = (fn: (p: PageLike) => PageLike) => (p: Project): Project => (isPageLike(p) ? fn(p) : p);

/** Applique une modification à une application (boutique) ; ignorée pour les autres types. */
export const appEdit = (fn: (p: AppProject) => AppProject) => (p: Project): Project => (p.kind === "app" ? fn(p) : p);
