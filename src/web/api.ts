import { Project, type ProjectKind } from "../core/schema.js";

export interface Health {
  ai: boolean;
  protected: boolean;
  limitPerHour: number;
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
