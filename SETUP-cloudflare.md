# Socle Cloudflare — marche à suivre (fait main par François)

Le **code** du socle est déjà dans le dépôt et **testé** (`npm test` → 13/13). Il reste les
actions qui exigent **ton compte Cloudflare** (dashboard + `wrangler`) et **tes secrets** :
je ne peux pas les faire à ta place, et je ne dois jamais écrire tes clés dans le dépôt.

> Rappel : **Account ID / Zone ID** = identifiants de config (pas des secrets), OK à coller
> dans `wrangler.toml`. **API token, clé LLM, clé PageSpeed** = **SECRETS** → uniquement via
> `wrangler secret put …`. Ne jamais les committer.

## ⚡ Raccourci (recommandé) — tout automatique après le login
Un seul geste manuel : `wrangler login` (dans TON navigateur). Le script fait le reste
(crée KV + D1 + R2, remplit `wrangler.toml`, applique le schéma). Il ne touche à aucun secret.
```bash
npm install
npx wrangler login
bash setup-resources.sh                 # macOS / Linux / Git Bash
```
**Windows / PowerShell** — même chose avec le script natif :
```powershell
npm install
npx wrangler login
powershell -ExecutionPolicy Bypass -File .\setup-resources.ps1
```
Puis pose les secrets + déploie (voir §3–4). Si tu préfères tout faire à la main, suis les
étapes détaillées ci-dessous.

## 0. Prérequis (une fois)
```bash
npm install            # installe wrangler (devDependency)
npx wrangler login     # connecte ton compte Cloudflare
```

## 1. Créer les ressources (Étape 2 de la checklist)
```bash
npx wrangler kv namespace create fl_cache     # → note l'id  → <KV_ID>
npx wrangler d1 create fl_data                # → note database_id → <D1_ID>
npx wrangler r2 bucket create fl-assets
```
Puis appliquer le schéma D1 :
```bash
npx wrangler d1 execute fl_data --file=schema.sql --remote
```

## 2. Compléter `wrangler.toml`
- `account_id` et `zone_id` sont **déjà renseignés** (identifiants de config, pas des secrets).
- Il reste à coller **2 valeurs** obtenues à l'étape 1 : `<KV_ID>` (sortie de
  `wrangler kv namespace create fl_cache`) et `<D1_ID>` (`database_id` de `wrangler d1 create fl_data`).

## 3. Poser les secrets (Étape 4 — jamais dans le dépôt)
```bash
npx wrangler secret put LLM_API_KEY
npx wrangler secret put PAGESPEED_API_KEY
```
Pour le dev local : `cp .dev.vars.example .dev.vars` puis renseigner les valeurs
(`.dev.vars` est déjà gitignoré).

## 4. Tester puis déployer le Worker (Étape 5)
```bash
npm test                       # tests hors-ligne du socle (déjà verts)
npx wrangler dev               # test local : http://localhost:8787/api/health
npx wrangler deploy            # met la route francoisleterrier.fr/api/* en ligne
```
Vérifier en prod :
```bash
curl https://api.francoisleterrier.fr/health      # → {"ok":true, ...}
```
> La route Worker intercepte `/api/*` au bord Cloudflare **même si le site est encore
> sur GitHub Pages** — tu peux donc valider le socle API avant toute migration d'hébergement.

## 5. (Optionnel, plus tard) Migrer l'hébergement statique vers Cloudflare Pages (Étape 1)
- Workers & Pages → Create → Pages → Connect to Git → ce dépôt.
- Build : aucun framework · **Output directory = `/` (racine)**.
- **Impératif SEO** : garder **exactement les mêmes chemins d'URL**. Ne pas introduire de
  redirections sauf nécessité (301 seulement).
- Le fichier `CNAME` (GitHub Pages) devient inutile côté Cloudflare mais reste inoffensif —
  **ne pas le supprimer tant que GitHub Pages sert encore le domaine**.
- Basculer le domaine apex sur Pages une fois les URLs vérifiées identiques.

## 6. Vérifications (Étape 6)
- [ ] Site public : mêmes URLs qu'avant (rien d'indexé cassé).
- [ ] `GET https://api.francoisleterrier.fr/health` → `{ ok:true }`.
- [ ] `health` renvoie `bindings: {kv:true, d1:true, r2:true}` (KV/D1/R2 rattachés).
- [x] **Aucune clé secrète dans le dépôt** — audit fait, dépôt propre (le seul `access_key`
      présent est l'ID public web3forms du formulaire, pas un secret serveur).
- [ ] Lighthouse mobile ≥ 95 (les photos sont déjà en WebP + fallback, contraste AA OK).

## 7. En-têtes de sécurité + parité des URLs (audit P2)

### En-têtes de sécurité — fichier `_headers` (déjà dans le dépôt)
Le fichier **`_headers`** applique, sur Cloudflare Pages, tous les en-têtes demandés :
`Strict-Transport-Security` (1 an, includeSubDomains, preload), `X-Content-Type-Options: nosniff`,
`X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy` (fonctionnalités sensibles désactivées) et une **`Content-Security-Policy`
adaptée aux ressources réellement chargées** (GA4/Tag Manager, Ahrefs, Calendly, Google Fonts,
Looker Studio, web3forms, Pexels, API Worker). GitHub Pages ignore ce fichier → aucun effet
tant que le site n'est pas sur Pages.
- **Vérifier après bascule** : <https://securityheaders.com/?q=francoisleterrier.fr> (viser A/A+).
- **Rollout prudent de la CSP** : d'abord tester sur l'URL `*.pages.dev`. En cas de doute,
  renommer l'en-tête `Content-Security-Policy` en `Content-Security-Policy-Report-Only`, ouvrir
  la console 24-48 h pour repérer d'éventuels blocages, puis rebasculer en mode bloquant.
- **HSTS `preload`** : le mot-clé est présent, mais l'inscription réelle se fait sur
  <https://hstspreload.org> — ne la soumets que quand **tous** les sous-domaines sont en HTTPS
  (engagement long, difficile à annuler).
- **Deux intégrations à garder dans la CSP** (déjà incluses) : les rapports **Looker Studio**
  de l'espace client (`frame-src lookerstudio.google.com`) et la synchro **DoubleClick** de GA4
  (`connect-src stats.g.doubleclick.net`). Si un jour tu retires GA4/Looker, tu peux les enlever.

### Prérequis DNS (seul toi peux le faire)
Pour que Cloudflare serve `francoisleterrier.fr` (Pages) **et** la route `/api/*` (Worker), le
domaine doit être **géré par Cloudflare** — aujourd'hui le DNS est encore chez OVH :
1. Ajouter `francoisleterrier.fr` dans ton compte Cloudflare (« Add a site »).
2. Chez OVH, remplacer les **serveurs de noms** par ceux fournis par Cloudflare.
3. Attendre la propagation (Cloudflare devient autoritaire), puis brancher Pages (§5) et la
   route Worker `/api/*` — dès lors `https://francoisleterrier.fr/api/health` répond.

### Parité des URLs — `check-url-parity.sh` (déjà dans le dépôt)
Garde-fou SEO « aucune URL indexée cassée ». À lancer AVANT puis APRÈS, et comparer les sorties
(aucun code HTTP ne doit changer) :
```bash
bash check-url-parity.sh https://francoisleterrier.fr     # avant (GitHub Pages) — baseline
bash check-url-parity.sh https://<projet>.pages.dev       # après, sans toucher au DNS
```
Baseline du 03/08/2026 : **123 URLs, 0 réponse non-200** ✅ (rien de cassé aujourd'hui).

---

### Ce qui est déjà livré dans le dépôt (prêt à l'emploi)
- `src/index.js` — Worker : `/api/health` + stubs `/api/generate`, `/api/audit`, `/api/lead`,
  avec **rate-limit par IP (KV)**, validation des entrées, en-têtes de sécurité, gestion
  d'erreurs sans fuite.
- `wrangler.toml` — gabarit avec bindings CACHE (KV) / DB (D1) / ASSETS (R2) et route `/api/*`.
- `schema.sql` — tables `leads`, `maquettes`, `audits`, `geo_checks`.
- `test/worker.test.mjs` — 13 tests hors-ligne (aucun compte requis) → `npm test`.
- `.dev.vars.example` + `.gitignore` durci (node_modules, .dev.vars, .env, .wrangler).

Une fois `/api/health` vert, on attaque le **Chantier 1 — le générateur** (spéc dans
`BRIEF-ULTIME-claude-code.md`).
