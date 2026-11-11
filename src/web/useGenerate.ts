import { useCallback, useEffect, useState } from "react";
import type { Project, ProjectKind } from "../core/schema.js";
import { generate, getHealth, saveCode, savedCode, type Health } from "./api.js";

/** undefined = en cours de vérification, null = serveur injoignable. */
export type HealthState = Health | null | undefined;

export function useGenerate() {
  const [health, setHealth] = useState<HealthState>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [code, setCodeState] = useState(savedCode);

  useEffect(() => {
    let alive = true;
    void getHealth().then((h) => alive && setHealth(h));
    return () => {
      alive = false;
    };
  }, []);

  const setCode = useCallback((value: string) => {
    saveCode(value);
    setCodeState(value);
  }, []);

  const run = useCallback(
    async (kind: ProjectKind, prompt: string, lang: "fr" | "en"): Promise<Project | null> => {
      setBusy(true);
      setError("");
      try {
        return await generate({ kind, prompt, lang, code });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Échec de la génération.");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [code],
  );

  const status =
    health === undefined ? "" : health === null ? "Le serveur ne répond pas. Les modèles fonctionnent quand même." : !health.ai ? "L'IA n'est pas activée sur ce serveur (clé ANTHROPIC_API_KEY absente). Les modèles fonctionnent sans." : "";

  return { health, busy, error, setError, code, setCode, run, status, canGenerate: Boolean(health?.ai) };
}
