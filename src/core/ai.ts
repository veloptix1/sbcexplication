import { z } from "zod";
import { BLOCK_META } from "./blocks.js";
import { BotDraft, BotProject, PageProject, SiteDraft, SiteProject, normalizeProject, type Project, type ProjectKind } from "./schema.js";
import { clampStrings } from "./util.js";

export interface GenerateRequest {
  kind: ProjectKind;
  prompt: string;
  lang: "fr" | "en";
}

export interface GenerateOptions {
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class AiError extends Error {
  constructor(
    message: string,
    /** Code HTTP renvoyé à l'utilisateur. */
    readonly status: 400 | 429 | 502 | 504,
  ) {
    super(message);
    this.name = "AiError";
  }
}

const TOOL_NAME = "build_project";
const MAX_ATTEMPTS = 2;

/** JSON Schema compris par l'API : sans $schema ni valeurs par défaut, oneOf → anyOf. */
export function toolSchema(kind: ProjectKind): Record<string, unknown> {
  const raw = z.toJSONSchema(kind === "bot" ? BotDraft : SiteDraft, { io: "input", unrepresentable: "any" });
  const clean = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(clean);
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node)) {
        if (k === "$schema" || k === "default") continue;
        out[k === "oneOf" ? "anyOf" : k] = clean(v);
      }
      return out;
    }
    return node;
  };
  return clean(raw) as Record<string, unknown>;
}

const COMMON_RULES = `Règles générales :
- Écris dans la langue de la demande (français par défaut). Un ton simple et direct, sans jargon, adapté à de petits commerces et indépendants d'Afrique francophone et anglophone.
- Contenu concret et utilisable tout de suite. Si la demande ne donne pas de prix, mets des prix d'exemple plausibles dans la devise locale évoquée (FCFA par défaut) : l'utilisateur les ajustera.
- N'invente jamais de numéro de téléphone, de WhatsApp, d'e-mail, d'adresse ni de lien : laisse le champ vide s'il n'est pas dans la demande.
- N'invente pas d'avis clients : n'utilise "testimonials" que si la demande fournit des témoignages.
- Réponds uniquement en appelant l'outil ${TOOL_NAME}.`;

export function systemPrompt(kind: ProjectKind, lang: "fr" | "en"): string {
  if (kind === "bot") {
    return `Tu conçois des bots Telegram pour un outil no-code. Tu produis l'arbre de menus du bot sous forme de liste à plat : chaque nœud a un "id" court et unique, et un "parent" qui vaut "root" (menu principal) ou l'id d'un autre nœud de type "message".
Types de nœuds :
- "message" : bouton qui affiche un texte (champ "text") et peut avoir des sous-boutons (ses enfants).
- "link" : bouton qui ouvre une adresse (champ "url", jamais de "text") ; sans enfants.
- "ask" : le bot demande à l'utilisateur d'écrire un message ("text" = la consigne) transmis à l'administrateur ; sans enfants. Utile pour commandes, réservations, support.
Contraintes : 6 à 20 nœuds, 3 niveaux maximum, 4 à 7 boutons par menu, libellés de moins de 30 caractères avec un emoji au début, textes courts et lisibles sur téléphone (pas de Markdown). "welcome" = message d'accueil du bot. Langue du bot : "${lang}".
${COMMON_RULES}`;
  }
  const blocks = Object.entries(BLOCK_META)
    .map(([type, m]) => `- "${type}" : ${m.hint}`)
    .join("\n");
  const shape =
    kind === "page"
      ? 'Une "page" est une page mobile étroite, façon page de liens ou mini-catalogue : 4 à 8 blocs, boutons pleine largeur, très peu de texte.'
      : 'Un "site" est un site web d\'une page : 6 à 12 blocs, qui commence par un "hero" et finit par un "footer".';
  return `Tu conçois des pages web pour un outil no-code. ${shape}
Blocs disponibles (champ "type") :
${blocks}
Dans "settings" : "title", "description" (pour le référencement), "lang" ("${lang}"), "theme" ("clean", "paper", "midnight" ou "forest"), "accent" (couleur hex #RRGGBB adaptée au métier), "emoji" (icône d'onglet), "whatsappFloat" (laisse vide sauf numéro fourni).
Les liens internes utilisent "#contact", "#orderForm" ou "#faq" (première section de ce type). Pour les images, laisse "url" vide : l'utilisateur ajoutera ses photos.
${COMMON_RULES}`;
}

interface ApiContentBlock {
  type: string;
  id?: string;
  name?: string;
  input?: unknown;
  text?: string;
}
type Message = { role: "user" | "assistant"; content: string | unknown[] };

async function callApi(opts: GenerateOptions, body: unknown): Promise<{ content: ApiContentBlock[] }> {
  const doFetch = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": opts.apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 50_000),
    });
  } catch (e) {
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
      throw new AiError("La génération a pris trop de temps. Réessaie avec une description plus courte.", 504);
    }
    throw new AiError("Impossible de joindre le service d'IA. Réessaie dans un instant.", 502);
  }
  if (!res.ok) {
    if (res.status === 429 || res.status === 529) throw new AiError("Le service d'IA est très sollicité. Réessaie dans une minute.", 429);
    if (res.status === 401 || res.status === 403) throw new AiError("La clé API du serveur est refusée. Vérifie ANTHROPIC_API_KEY.", 502);
    throw new AiError(`Le service d'IA a répondu avec une erreur (${res.status}).`, 502);
  }
  return (await res.json()) as { content: ApiContentBlock[] };
}

function buildProject(kind: ProjectKind, input: unknown): Project {
  const data = clampStrings(input);
  if (kind === "bot") {
    const bot = normalizeProject(BotProject.parse({ kind, ...BotDraft.parse(data) }));
    if (bot.kind === "bot" && bot.nodes.length === 0) throw new Error("nodes : le bot ne contient aucun nœud");
    return bot;
  }
  const draft = SiteDraft.parse(data);
  if (draft.blocks.length === 0) throw new Error("blocks : la page ne contient aucun bloc");
  return kind === "page" ? PageProject.parse({ kind, ...draft }) : SiteProject.parse({ kind, ...draft });
}

/** Demande un projet à l'IA, le valide, et redemande une fois en cas d'erreur de structure. */
export async function generateProject(req: GenerateRequest, opts: GenerateOptions): Promise<Project> {
  const messages: Message[] = [{ role: "user", content: req.prompt }];
  let lastError = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const data = await callApi(opts, {
      model: opts.model,
      max_tokens: 8000,
      system: systemPrompt(req.kind, req.lang),
      tools: [{ name: TOOL_NAME, description: "Enregistre le projet généré.", input_schema: toolSchema(req.kind) }],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages,
    });
    const call = data.content.find((c) => c.type === "tool_use" && c.name === TOOL_NAME);
    if (!call) {
      lastError = "aucun résultat structuré";
      continue;
    }
    try {
      return buildProject(req.kind, call.input);
    } catch (e) {
      lastError = e instanceof z.ZodError ? e.issues.map((i) => `${i.path.join(".")} : ${i.message}`).slice(0, 8).join("\n") : e instanceof Error ? e.message : "résultat invalide";
      messages.push(
        { role: "assistant", content: data.content },
        { role: "user", content: [{ type: "tool_result", tool_use_id: call.id, is_error: true, content: `Structure invalide, corrige et rappelle l'outil :\n${lastError}` }] },
      );
    }
  }
  throw new AiError("L'IA n'a pas produit un résultat exploitable. Reformule ta demande avec un peu plus de détails.", 502);
}
