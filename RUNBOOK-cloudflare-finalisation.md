# Finalisation de la migration Cloudflare — runbook

> Objectif : mettre Cloudflare **devant** le site pour la sécurité (en-têtes),
> le CDN, le SSL et le pare-feu — **sans rien casser**. Étapes 100 % réalisables
> depuis le tableau de bord Cloudflare (dashboard), y compris au téléphone.
> Aucune clé ni mot de passe à me communiquer.

---

## 0. L'architecture retenue (et pourquoi)

Le domaine `francoisleterrier.fr` héberge **deux sites GitHub Pages distincts** :

| URL | Dépôt GitHub | Techno |
|-----|--------------|--------|
| `francoisleterrier.fr/` (site principal) | `francoisleterrier-lab.github.io` | HTML statique |
| `francoisleterrier.fr/faire-part-vivant/` (sous-site) | `francoisleterrier-lab/faire-part-vivant` | React + Vite + Supabase (PWA) |
| `francoisleterrier.fr/api/*` (back-end) | Cloudflare **Worker** `main` | déjà en place ✅ |

**On garde GitHub Pages** pour héberger les deux sites (c'est GitHub qui, grâce au
domaine personnalisé sur le dépôt d'organisation, sert **aussi** le sous-site sous
`/faire-part-vivant/`). On met simplement Cloudflare **en proxy** devant.

> ⚠️ **Ce qu'il ne faut PAS faire** : ajouter `francoisleterrier.fr` comme
> « domaine personnalisé » sur le projet **Cloudflare Pages**
> (`francoisleterrier-lab-github-io.pages.dev`). Ce projet ne contient que le
> dépôt racine → il renverrait **404 sur `/faire-part-vivant/`** et casserait le
> sous-site. On n'utilise donc **pas** Cloudflare Pages pour le domaine ; on
> utilise le **proxy Cloudflare devant GitHub Pages**.

> ℹ️ Le fichier `_headers` du dépôt ne sert **que** sur Cloudflare Pages. Sur
> GitHub Pages il est **inerte** : les en-têtes viendront donc des **Transform
> Rules** Cloudflare (étape 3). On garde `_headers` comme documentation de la CSP.

---

## 1. DNS : passer les enregistrements en « Proxied » (nuage orange)

Cloudflare → **DNS** → **Records**. Vérifier / régler :

| Type | Nom | Contenu | Proxy |
|------|-----|---------|-------|
| A | `francoisleterrier.fr` | `185.199.108.153` | 🟠 **Proxied** |
| A | `francoisleterrier.fr` | `185.199.109.153` | 🟠 **Proxied** |
| A | `francoisleterrier.fr` | `185.199.110.153` | 🟠 **Proxied** |
| A | `francoisleterrier.fr` | `185.199.111.153` | 🟠 **Proxied** |
| CNAME | `www` | `francoisleterrier-lab.github.io` | 🟠 **Proxied** |

- Le **nuage orange** = Cloudflare est dans le chemin → il peut ajouter les
  en-têtes, le CDN et le pare-feu. Nuage **gris** = DNS seul, Cloudflare ne voit
  pas le trafic (les en-têtes ne s'appliqueraient pas).
- **Ne touchez pas** aux enregistrements e-mail : MX, SPF (`TXT v=spf1…`),
  DMARC (`_dmarc`), DKIM/Brevo (`brevo._domainkey`, `mail._domainkey`…) restent
  tels quels, en **DNS only (gris)**. Le proxy ne concerne que le web (A / www).

---

## 2. SSL/TLS : mode « Full (strict) »

Cloudflare → **SSL/TLS** → **Overview** :

- Mode de chiffrement : **Full (strict)**.
  - GitHub Pages sert déjà un certificat valide pour `francoisleterrier.fr`
    (le site tournait déjà sur ce domaine) → « Full (strict) » fonctionne.
  - ⚠️ **Ne jamais choisir « Flexible »** : GitHub Pages force le HTTPS →
    « Flexible » créerait une **boucle de redirection** (le site ne s'ouvre plus).
- Cloudflare → **SSL/TLS** → **Edge Certificates** :
  - **Always Use HTTPS** : **On**.
  - **Automatic HTTPS Rewrites** : **On**.

> Si, juste après le passage en orange, le site affiche une erreur de certificat
> pendant quelques minutes, c'est normal (propagation). Si ça persiste > 30 min,
> repasser temporairement les A/www en **gris**, attendre que GitHub → Settings →
> Pages affiche « ✅ HTTPS enforced », puis remettre en **orange**.

---

## 3. En-têtes de sécurité (Transform Rules)

Cloudflare → **Rules** → **Transform Rules** → **Modify Response Header**.

### Règle A — En-têtes globaux (tout le domaine)

- **Nom** : `Sécurité — en-têtes globaux`
- **Expression (Edit expression)** :
  ```
  (http.host eq "francoisleterrier.fr" or http.host eq "www.francoisleterrier.fr")
  ```
- **Then… Set static** (ajouter chaque en-tête avec « + Set static ») :

  | Header name | Value |
  |-------------|-------|
  | `X-Content-Type-Options` | `nosniff` |
  | `X-Frame-Options` | `SAMEORIGIN` |
  | `Referrer-Policy` | `strict-origin-when-cross-origin` |
  | `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()` |

  Ces 4 en-têtes sont **sans risque** pour les deux sites.

### Règle B — CSP (site principal uniquement, **pas** le sous-site ni l'API)

- **Nom** : `Sécurité — CSP site principal`
- **Expression** — exclut `/faire-part-vivant/` (React/Supabase, besoins CSP
  différents) et `/api/` (le Worker pose ses propres en-têtes) :
  ```
  (http.host eq "francoisleterrier.fr"
   and not starts_with(http.request.uri.path, "/faire-part-vivant")
   and not starts_with(http.request.uri.path, "/api"))
  ```
- **Then… Set static** :

  | Header name | Value |
  |-------------|-------|
  | `Content-Security-Policy` | *(voir la valeur exacte ci-dessous, une seule ligne)* |

  ```
  default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; script-src 'self' 'unsafe-inline' https://analytics.ahrefs.com https://assets.calendly.com https://challenges.cloudflare.com https://connect.facebook.net https://www.googletagmanager.com; style-src 'self' 'unsafe-inline' https://assets.calendly.com https://fonts.googleapis.com; img-src 'self' data: https://analytics.ahrefs.com https://assets.calendly.com https://images.pexels.com https://region1.google-analytics.com https://s.wordpress.com https://www.facebook.com https://www.google-analytics.com https://www.google.com https://www.googletagmanager.com https://*.supabase.co; font-src 'self' data: https://assets.calendly.com https://fonts.gstatic.com; connect-src 'self' https://analytics.ahrefs.com https://analytics.google.com https://calendly.com https://main.francois-leterrier-cmw.workers.dev https://region1.google-analytics.com https://stats.g.doubleclick.net https://www.facebook.com https://www.google-analytics.com https://www.googletagmanager.com https://*.supabase.co wss://*.supabase.co; frame-src 'self' https://challenges.cloudflare.com https://calendly.com https://datastudio.google.com https://lookerstudio.google.com https://www.google.com; media-src 'self' https://*.supabase.co; form-action 'self' https://api.web3forms.com; manifest-src 'self'; worker-src 'self' blob:; upgrade-insecure-requests
  ```

  > **Rollout prudent (recommandé au 1er coup)** : nommer d'abord l'en-tête
  > `Content-Security-Policy-Report-Only` au lieu de `Content-Security-Policy`.
  > La CSP est alors **observée mais pas appliquée** : on ouvre le site, on
  > vérifie la console du navigateur (aucune ressource bloquée), puis on renomme
  > l'en-tête en `Content-Security-Policy` pour l'activer réellement.

  > 🔒 **Pourquoi exclure le sous-site** : `/faire-part-vivant/` (React + Supabase
  > + service worker + notifications push) charge des ressources que cette CSP ne
  > liste pas (Supabase, ses propres scripts modules). Lui appliquer cette CSP le
  > **casserait**. Il garde donc ses propres réglages ; on lui écrira une CSP
  > dédiée plus tard si besoin.

### HSTS — via le bouton dédié (pas une Transform Rule)

Cloudflare → **SSL/TLS** → **Edge Certificates** → **HTTP Strict Transport
Security (HSTS)** → **Enable** :

- Max Age : **12 months** (`31536000`)
- Include subdomains : **On**
- Preload : **On**
- No-Sniff : **On**

> ⚠️ HSTS avec `preload` est **quasi irréversible** (les navigateurs mémorisent
> l'obligation HTTPS pour des mois). À n'activer **qu'une fois** que tout le site
> (site principal **et** `/faire-part-vivant/`) répond bien en HTTPS. C'est déjà
> le cas aujourd'hui, donc OK — mais on l'active en **dernier**, après la
> vérification de l'étape 5.

---

## 4. Worker API — déjà fait ✅

Cloudflare → **Workers Routes** : la route `francoisleterrier.fr/api/*` →
Worker `main` est **déjà configurée**. Rien à faire. (C'est pour ça que la
Règle B exclut `/api/` : le Worker gère ses propres en-têtes.)

---

## 5. Vérification (après chaque étape, puis à la fin)

Depuis un ordinateur, à la racine du dépôt :

```bash
# 5a. Parité : les 123 URLs du sitemap répondent 200 (dont /faire-part-vivant/)
./check-url-parity.sh https://francoisleterrier.fr

# 5b. En-têtes de sécurité présents sur le site principal
./check-headers.sh
```

À vérifier **à la main** dans un navigateur :

1. `https://francoisleterrier.fr/` s'ouvre, cadenas OK, aucune erreur console.
2. `https://francoisleterrier.fr/faire-part-vivant/` s'ouvre **et fonctionne**
   (le configurateur, les images, la connexion Supabase) — **pas de 404, pas de
   ressource bloquée** dans la console.
3. `https://francoisleterrier.fr/api/health` répond (JSON du Worker).
4. `http://francoisleterrier.fr` (en http) redirige bien vers `https://`.

---

## 6. Plan de retour arrière (rollback)

Si quelque chose casse après le passage en orange :

1. **DNS** → repasser les A + www en **nuage gris** (DNS only). En quelques
   minutes, le trafic contourne Cloudflare et revient à l'état d'avant.
2. Les Transform Rules peuvent être **désactivées** individuellement (toggle)
   sans les supprimer.
3. Ne pas activer **HSTS preload** tant que le point 5 n'est pas 100 % vert
   (c'est la seule étape difficile à annuler).

---

## Récapitulatif de l'ordre d'exécution

1. DNS A + www → **orange** (proxied).
2. SSL/TLS → **Full (strict)** + Always Use HTTPS.
3. Transform Rule **A** (4 en-têtes globaux).
4. Transform Rule **B** (CSP en **Report-Only** d'abord, hors `/faire-part-vivant/`
   et `/api/`).
5. Vérifier (étape 5) → si tout est vert, passer la CSP de Report-Only à
   **appliquée**.
6. Vérifier encore → **puis** activer **HSTS** (preload).

Une fois ces 6 points faits, la migration est **terminée** : mêmes deux sites,
servis par GitHub Pages, mais protégés et accélérés par Cloudflare, avec les
en-têtes de sécurité vérifiés.
