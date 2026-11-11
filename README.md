# AppForge

Studio pour créer en quelques minutes :

- **un site web** (plusieurs sections, adapté au téléphone),
- **une page mobile** (page de liens, mini-catalogue, commande WhatsApp),
- **un bot Telegram** (menus, réponses, messages transmis à toi),

à partir d'un **modèle** ou d'une **description** (génération par IA). Tout se modifie ensuite à la main, avec aperçu en direct, annuler/rétablir, et export.

Écrit en TypeScript de bout en bout : moteur partagé (`src/core`), API Hono (`src/server`), interface React (`src/web`).

## Démarrer

```bash
npm install
npm run dev          # interface sur http://localhost:5173, API sur :8787
```

Pour le mode IA, ajoute une clé avant de lancer :

```bash
ANTHROPIC_API_KEY="sk-ant-..." npm run dev
```

Sans clé, les modèles et l'éditeur fonctionnent normalement. Seul le bouton « Créer avec l'IA » est désactivé.

Version compilée (un seul serveur) :

```bash
npm run build && npm start     # http://localhost:8787
```

## Variables d'environnement

| Variable | Rôle | Défaut |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Active la génération par IA | (absente = IA désactivée) |
| `ANTHROPIC_MODEL` | Modèle utilisé | `claude-sonnet-5-5` |
| `MAX_GENERATIONS_PER_HOUR` | Limite par adresse IP | `10` |
| `ACCESS_CODE` | Code demandé avant chaque génération (protège ta clé) | (aucun) |

La génération est facturée sur ta clé : garde la limite par heure, mets un `ACCESS_CODE` si le site est public, et fixe un plafond de dépense côté Anthropic. Le compteur est en mémoire : sur Vercel (plusieurs instances) il reste approximatif.

## Déployer sur Vercel

Importe le dépôt dans Vercel et ajoute les variables ci-dessus. `vercel.json` compile l'interface (`dist/`) et sert l'API depuis `api/index.ts` (60 s maximum par génération).

## GitHub Actions

`.github/workflows/ci.yml` s'exécute à chaque push : vérification des types, tests, compilation, puis archive du site compilé (`dist`) téléchargeable dans l'onglet *Actions*.

## Ce que fait chaque partie

- `src/core/schema.ts` : formes valides d'un site, d'une page et d'un bot (zod). Tout ce qui vient de l'IA ou d'un import passe par là.
- `src/core/render-site.ts` : génère un fichier HTML autonome. Contenu échappé, liens filtrés (`javascript:` et `data:` refusés), vidéos limitées à YouTube/Vimeo.
- `src/core/bot.ts` : génère un bot Node.js sans dépendance (`bot.mjs`, `package.json`, `.env.example`, `README`). Le simulateur de l'éditeur et le bot exporté suivent la même règle.
- `src/core/ai.ts` : appel à l'API avec sortie structurée imposée, validation, et une seconde tentative si la structure est invalide.
- `src/server/app.ts` : routes `/api/health` et `/api/generate`, avec limite par IP et code d'accès.

## Tests

```bash
npm test
```

36 tests, dont l'exécution du bot exporté face à un faux serveur Telegram, qui vérifie que ses messages sont identiques à ceux du simulateur.

## Limites actuelles

- Les projets sont enregistrés dans le navigateur (exporte-les en `.json` pour les garder ailleurs).
- Les images se mettent par lien, pas d'envoi de fichier.
- Le bot exporté tourne en long polling : il faut un serveur qui reste allumé (VPS, Railway, Render, Fly.io, `pm2`), pas Vercel.
