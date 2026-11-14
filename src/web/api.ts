import { Project, type ProjectKind } from "../core/schema.js";

export interface Health {
  ai: boolean;
  protected: boolean;
  limitPerHour: number;
  storage?: string;
  persistent?: boolean;
  apk?: boolean;
}

export async function getHealth(): Promise<Health | null> {
  try {
    const res = await fetch("/api/health");
    if (!res.ok) return null;
    return (await res.json()) as Health;
  } catch {
    return null;
  }
}

const CODE_KEY = "appforge:code";
export const savedCode = (): string => {
  try {
    return sessionStorage.getItem(CODE_KEY) ?? "";
  } catch {
    return "";
  }
};
export const saveCode = (code: string): void => {
  try {
    sessionStorage.setItem(CODE_KEY, code);
  } catch {
    /* ignoré */
  }
};

export async function generate(input: { kind: ProjectKind; prompt: string; lang: "fr" | "en"; code: string }): Promise<Project> {
  let res: Response;
  try {
    res = await fetch("/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...input, code: input.code || undefined }),
    });
  } catch {
    throw new Error("Connexion impossible. Vérifie ton réseau puis réessaie.");
  }
  const body = (await res.json().catch(() => null)) as { project?: unknown; error?: string } | null;
  if (!res.ok) throw new Error(body?.error ?? `Erreur ${res.status}`);
  const parsed = Project.safeParse(body?.project);
  if (!parsed.success) throw new Error("Le résultat reçu n'est pas valide. Réessaie.");
  return parsed.data;
}

const KEYS = "appforge:keys";
const readKeys = (): Record<string, string> => {
  try {
    return JSON.parse(localStorage.getItem(KEYS) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
};
/** Clés d'administration des boutiques publiées depuis cet appareil. */
export const adminKeyFor = (slug: string): string => readKeys()[slug] ?? "";
export const saveAdminKey = (slug: string, key: string): void => {
  try {
    localStorage.setItem(KEYS, JSON.stringify({ ...readKeys(), [slug]: key }));
  } catch {
    /* stockage désactivé : la clé reste affichée à l'écran */
  }
};

export interface PublishResult {
  slug: string;
  url: string;
  created: boolean;
  adminKey?: string;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error("Pas de connexion au serveur.");
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; code?: string };
  if (!res.ok) throw Object.assign(new Error(data.error ?? `Erreur ${res.status}`), { code: data.code });
  return data;
}

export const publish = (slug: string, project: unknown, key: string) => post<PublishResult>("/api/publish", { slug, project, ...(key ? { key } : {}) });
export const apkBuild = (slug: string, key: string) => post<{ ok: true }>("/api/apk/build", { slug, key });
export interface ApkStatus { state: "unconfigured" | "none" | "running" | "failed" | "done"; runUrl?: string; downloadUrl?: string; releaseUrl?: string }
export async function apkStatus(slug: string): Promise<ApkStatus> {
  try {
    const res = await fetch(`/api/apk/status/${encodeURIComponent(slug)}`);
    return res.ok ? ((await res.json()) as ApkStatus) : { state: "none" };
  } catch {
    return { state: "none" };
  }
}
