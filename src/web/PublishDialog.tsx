import { useEffect, useRef, useState } from "react";
import type { PageLike } from "../core/schema.js";
import { slugify } from "../core/util.js";
import { adminKeyFor, apkBuild, apkStatus, getHealth, publish, saveAdminKey, type ApkStatus, type Health, type PublishResult } from "./api.js";
import { copyText } from "./files.js";

interface Props {
  project: PageLike;
  onClose: () => void;
  onPublished: (slug: string) => void;
  toast: (m: string) => void;
}

const REPO_ACTIONS = "https://github.com/veloptix1/sbcexplication/actions/workflows/apk.yml";

export function PublishDialog({ project, onClose, onPublished, toast }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [slug, setSlug] = useState(project.publication?.slug ?? slugify(project.name).slice(0, 40));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PublishResult | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [apk, setApk] = useState<ApkStatus | null>(null);
  const [apkErr, setApkErr] = useState("");
  const isApp = project.kind === "app";
  const published = project.publication?.slug === slug.trim();
  const origin = location.origin;

  useEffect(() => { ref.current?.showModal(); void getHealth().then(setHealth); }, []);

  const liveSlug = result?.slug ?? (project.publication?.slug || "");
  const key = result?.adminKey ?? (liveSlug ? adminKeyFor(liveSlug) : "");

  // Suivi de la compilation de l'APK.
  useEffect(() => {
    if (!isApp || !liveSlug) return;
    let stop = false;
    const tick = async () => {
      const s = await apkStatus(liveSlug);
      if (stop) return;
      setApk(s);
      if (s.state === "running") setTimeout(() => void tick(), 8000);
    };
    void tick();
    return () => { stop = true; };
  }, [isApp, liveSlug, result]);

  const go = async () => {
    setBusy(true);
    setError("");
    try {
      const clean = slugify(slug).slice(0, 40);
      const r = await publish(clean, project, adminKeyFor(clean));
      if (r.adminKey) saveAdminKey(r.slug, r.adminKey);
      setResult(r);
      setSlug(r.slug);
      onPublished(r.slug);
      toast(r.created ? "Publié !" : "Mise à jour publiée.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  const buildApk = async () => {
    setApkErr("");
    try {
      await apkBuild(liveSlug, key);
      setApk({ state: "running" });
      setTimeout(async () => setApk(await apkStatus(liveSlug)), 6000);
    } catch (e) {
      setApkErr(e instanceof Error ? e.message : "Erreur");
    }
  };

  const base = `${origin}/${isApp ? "a" : "s"}/${liveSlug}`;
  const adminUrl = `${origin}/a/${liveSlug}/admin#key=${key}`;
  const noStorage = health !== null && health.persistent === false;

  return (
    <dialog ref={ref} className="dialog wide" onClose={onClose} onCancel={(e) => { if (busy) e.preventDefault(); }}>
      <h2>Publier</h2>
      {noStorage ? (
        <p className="notice light error" role="alert">Ce serveur n'a pas de base de données : rien ne peut être publié. Ajoute <code>SUPABASE_URL</code> et <code>SUPABASE_SERVICE_KEY</code> dans les variables d'environnement de Vercel (le README explique comment, 5 minutes).</p>
      ) : null}

      <div className="field">
        <label htmlFor="pub-slug">Adresse de {isApp ? "la boutique" : "la page"}</label>
        <div className="slugrow"><span>{origin}/{isApp ? "a" : "s"}/</span><input id="pub-slug" value={slug} maxLength={40} autoComplete="off" spellCheck={false} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} /></div>
        <p className="hint">Lettres minuscules, chiffres et tirets. {published ? "Cette adresse est déjà la tienne : publier met la boutique à jour." : ""}</p>
      </div>
      {error ? <p className="notice light error" role="alert">{error}</p> : null}

      <div className="dialog-actions">
        <button type="button" className="btn ghost" disabled={busy} onClick={() => ref.current?.close()}>Fermer</button>
        <button type="button" className="btn solid" disabled={busy || slug.trim().length < 2 || noStorage} onClick={() => void go()}>{busy ? "Publication…" : published ? "Mettre à jour" : "Publier"}</button>
      </div>

      {liveSlug ? (
        <div className="published">
          <h3>En ligne</h3>
          <p><a href={base} target="_blank" rel="noopener">{base}</a> <button type="button" className="mini" onClick={async () => toast((await copyText(base)) ? "Lien copié." : "Copie impossible.")}>Copier</button></p>

          {result?.adminKey ? (
            <div className="keybox" role="alert">
              <strong>Ta clé d'administration (affichée une seule fois)</strong>
              <code>{result.adminKey}</code>
              <button type="button" className="mini" onClick={async () => toast((await copyText(result.adminKey ?? "")) ? "Clé copiée." : "Copie impossible.")}>Copier la clé</button>
              <p className="hint">Elle te permet de gérer les commandes. Elle est aussi retenue sur cet appareil. Si tu la perds, tu ne peux plus mettre à jour cette adresse : note-la quelque part.</p>
            </div>
          ) : null}

          {isApp && key ? (
            <>
              <p><a className="btn solid inline" href={adminUrl} target="_blank" rel="noopener">Ouvrir l'administration</a></p>

              <h3>Application Android (APK)</h3>
              {apk?.state === "done" && apk.downloadUrl ? (
                <p><a className="btn solid inline" href={apk.downloadUrl} rel="noopener">Télécharger l'APK</a> <a href={apk.releaseUrl} target="_blank" rel="noopener">Voir la version</a></p>
              ) : apk?.state === "running" ? (
                <p className="notice light" role="status">Compilation en cours (5 à 10 minutes). <a href={apk.runUrl} target="_blank" rel="noopener">Suivre sur GitHub</a></p>
              ) : (
                <>
                  {apk?.state === "failed" ? <p className="notice light error" role="alert">La dernière compilation a échoué. <a href={apk.runUrl} target="_blank" rel="noopener">Voir le journal</a></p> : null}
                  {health?.apk ? (
                    <button type="button" className="btn solid" onClick={() => void buildApk()}>Compiler l'APK</button>
                  ) : (
                    <div className="hint">
                      <p>Le bouton automatique demande un jeton GitHub (<code>GITHUB_TOKEN</code>) sur le serveur. Sans lui, lance la compilation à la main :</p>
                      <ol>
                        <li>Ouvre <a href={REPO_ACTIONS} target="_blank" rel="noopener">GitHub › Actions › APK</a> puis « Run workflow ».</li>
                        <li>Adresse complète : <code>{base}</code> · slug : <code>{liveSlug}</code> · nom : <code>{project.name.slice(0, 30)}</code></li>
                        <li>Au bout de quelques minutes, l'APK est dans les Releases du dépôt (<code>apk-{liveSlug}</code>).</li>
                      </ol>
                    </div>
                  )}
                </>
              )}
              {apkErr ? <p className="notice light error" role="alert">{apkErr}</p> : null}
              <p className="hint">L'application affiche ta boutique en direct : quand tu republies, elle se met à jour sans recompiler.</p>
            </>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}
