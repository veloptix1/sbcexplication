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
| `SUPABASE_URL` | Adresse du projet Supabase (base de données des boutiques) | (absente = fichier JSON en local ; publication impossible sur Vercel) |
| `SUPABASE_SERVICE_KEY` | Clé **service_role** Supabase (serveur uniquement, jamais dans le navigateur) | |
| `SESSION_SECRET` | Secret qui signe les sessions clients | dérivé de la clé Supabase |
| `GITHUB_TOKEN` | Active le bouton « Compiler l'APK » (jeton fin, permission *Actions : lecture et écriture* sur le dépôt) | (absent = lancement manuel) |
| `GITHUB_REPO` | Dépôt qui contient `apk.yml` | `veloptix1/sbcexplication` |
| `PUBLIC_URL` | Adresse https publique du déploiement (celle que l'APK affichera) | adresse de la requête |
| `DATA_FILE` | Fichier de données du serveur Node (sans Supabase) | `data/appforge.json` |

La génération est facturée sur ta clé : garde la limite par heure, mets un `ACCESS_CODE` si le site est public, et fixe un plafond de dépense côté Anthropic. Le compteur est en mémoire : sur Vercel (plusieurs instances) il reste approximatif.

## Déployer sur Vercel

Importe le dépôt dans Vercel et ajoute les variables ci-dessus. `vercel.json` compile l'interface (`dist/`) et sert l'API depuis `api/index.ts` (60 s maximum par génération).

## Publier des boutiques (base de données)

1. Crée un projet gratuit sur supabase.com, ouvre *SQL Editor*, colle le contenu de `supabase/schema.sql` et exécute.
2. Dans *Project Settings › API*, copie l'adresse du projet et la clé `service_role`.
3. Dans Vercel › *Settings › Environment Variables*, ajoute `SUPABASE_URL` et `SUPABASE_SERVICE_KEY`, puis redéploie.

Sans cela, le bouton *Publier* répond qu'il n'y a pas de base de données (les boutiques seraient perdues à chaque redémarrage). En local (`npm start`), un fichier JSON suffit.

Une application publiée est servie sur `/a/<adresse>` (boutique) et `/a/<adresse>/admin` (administration, protégée par la clé affichée une seule fois à la publication). Une page ou un site publié est servi sur `/s/<adresse>`.

## Compiler l'APK

L'APK est une application Android (Capacitor) qui affiche ta boutique en direct : republier met l'application à jour sans recompiler.

- Automatique : définis `GITHUB_TOKEN` (et `PUBLIC_URL`), puis clique *Compiler l'APK* dans la fenêtre *Publier*.
- Manuel : GitHub › *Actions* › *APK* › *Run workflow*, avec l'adresse complète de la boutique, son adresse courte, son nom et sa couleur.

Le fichier `<adresse>.apk` apparaît dans les *Releases* du dépôt (étiquette `apk-<adresse>`). Il est signé avec la clé de debug : il s'installe directement sur un téléphone, mais n'est pas prêt pour le Play Store (il faudrait une clé de signature de publication). Si le dépôt est privé, télécharge-le depuis ton compte GitHub.

## GitHub Actions

`.github/workflows/ci.yml` s'exécute à chaque push : vérification des types, tests, compilation, puis archive du site compilé (`dist`) téléchargeable dans l'onglet *Actions*.

## Ce que fait chaque partie

- `src/core/schema.ts` : formes valides d'un site, d'une page et d'un bot (zod). Tout ce qui vient de l'IA ou d'un import passe par là.
- `src/core/render-site.ts` : génère un fichier HTML autonome. Contenu échappé, liens filtrés (`javascript:` et `data:` refusés), vidéos limitées à YouTube/Vimeo.
- `src/core/bot.ts` : génère un bot Node.js sans dépendance (`bot.mjs`, `package.json`, `.env.example`, `README`). Le simulateur de l'éditeur et le bot exporté suivent la même règle.
- `src/core/ai.ts` : appel à l'API avec sortie structurée imposée, validation, et une seconde tentative si la structure est invalide.
- `src/server/app.ts` : routes `/api/health` et `/api/generate`, avec limite par IP et code d'accès.
- `src/server/shop.ts` : publication, comptes clients (PBKDF2 + jetons signés), commandes (prix et stock recalculés côté serveur), administration, export CSV, alertes Telegram.
- `src/server/store.ts` : stockage mémoire, fichier JSON ou Supabase (écriture optimiste, pas de survente).
- `src/server/apk.ts` : lance et suit le workflow `apk.yml`.
- `src/storefront/` : boutique publiée et panneau d'administration (page `storefront.html`).
- `scripts/apk/prepare.mjs` : génère le projet Android utilisé par `apk.yml`.

## Tests

```bash
npm test
```

52 tests : commandes concurrentes, stock, administration, Supabase simulé, lancement du workflow APK, et exécution du bot exporté face à un faux serveur Telegram (ses messages sont identiques à ceux du simulateur).

## Limites actuelles

- Les projets sont enregistrés dans le navigateur (exporte-les en `.json` pour les garder ailleurs).
- Les images se mettent par lien, pas d'envoi de fichier.
- Mobile Money : le client saisit le numéro de transaction et tu valides le paiement à la main dans l'administration (aucune API d'opérateur n'est branchée). Le lien de paiement en ligne ouvre la page de ton agrégateur, mais la confirmation n'est pas automatique.
- Les comptes clients n'ont ni vérification du numéro par SMS, ni « mot de passe oublié ».
- Le bot exporté tourne en long polling : il faut un serveur qui reste allumé (VPS, Railway, Render, Fly.io, `pm2`), pas Vercel.
