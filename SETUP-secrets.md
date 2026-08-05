# Activer les fonctionnalités qui demandent une clé — récap complet

> Le back-end (Cloudflare Worker `main`) est **déjà en ligne**. Chaque fonction
> avancée s'active en posant **un secret**, sans toucher au code. Tout ce qui
> n'a pas encore sa clé **fonctionne quand même en mode dégradé** (jamais
> d'erreur pour le visiteur) — le détail est indiqué ci-dessous.

## Règles de sécurité (rappel)

- Les clés se posent **uniquement** avec `wrangler secret put …` → elles vont dans
  Cloudflare, **jamais** dans le dépôt Git, jamais en clair dans une page.
- **Ne me communique jamais** une clé ou un mot de passe (OVH, Cloudflare, Stripe,
  Brevo, Google…). Je ne dois pas les manipuler. Ce doc te donne les commandes ;
  c'est **toi** qui les exécutes.
- Toutes les commandes se lancent depuis la racine du dépôt, avec `wrangler` connecté.
  Après un `wrangler secret put`, il te demande de coller la valeur (invisible), Entrée.

## Vérifier ce qui est déjà activé

```
curl https://francoisleterrier.fr/api/health
```
La réponse liste des booléens : `brevo`, `stripe`, `stripe_webhook`, `places`,
`pagespeed`. `true` = activé, `false` = clé pas encore posée.

---

## 1. Formulaire de contact / leads → Brevo  *(recommandé en 1er)*

**Ce que ça débloque** : chaque lead (contact, devis, configurateur) est ajouté à
ta liste de contacts Brevo pour tes relances/newsletters.
**Sans la clé** : le lead est quand même enregistré côté Worker (base D1) et visible
dans `/admin.html` — il n'est simplement pas poussé dans Brevo.

- Clé API : Brevo → **SMTP & API** → **API Keys** → *Generate a new API key*.
- ID de liste : Brevo → **Contacts** → **Lists** → le numéro de ta liste.

```
wrangler secret put BREVO_API_KEY
wrangler secret put BREVO_LIST_ID     # ex. : 3
```

## 2. Paiement en ligne → Stripe

**Ce que ça débloque** : le règlement en ligne (`/checkout`, acompte de devis).
**Sans la clé** : le bouton de paiement répond « Paiement en ligne pas encore
activé » (503) — le reste du site est intact.

- Clé secrète : Stripe → **Developers** → **API keys** → *Secret key* (`sk_live_…`).
- Secret de webhook : Stripe → **Developers** → **Webhooks** → ton endpoint
  `https://francoisleterrier.fr/api/stripe/webhook` → *Signing secret* (`whsec_…`).

```
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_WEBHOOK_SECRET
```

## 3. Audit de site — données Google  *(bonus qualité)*

**Ce que ça débloque** : dans l'outil d'audit (`/audit.html`), les données Google
Places (note, avis, fiche) du site audité, et des scores PageSpeed plus fiables.
**Sans les clés** : l'audit fonctionne déjà (score, SEO, projection) ; il saute
juste la partie Places et utilise PageSpeed en mode public (quota limité).

- Places / PageSpeed : **Google Cloud Console** → *APIs & Services* → activer
  **Places API** et **PageSpeed Insights API** → *Credentials* → *API key*.
  (Tu peux utiliser la même clé pour les deux si elle a accès aux deux API.)

```
wrangler secret put PLACES_API_KEY
wrangler secret put PAGESPEED_API_KEY
```

## 4. Générateur de site — LLM de secours  *(optionnel)*

**Ce que ça débloque** : un LLM externe en repli pour `/generate`.
**Sans la clé** : le générateur tourne déjà sur **Workers AI** (intégré, gratuit) —
cette clé n'est utile que si tu veux un modèle externe précis.

```
wrangler secret put LLM_API_KEY
```

## 5. Tableau de bord admin

**Ce que ça débloque** : l'accès à `/admin.html` (liste des leads, statuts).
**Sans la clé** : l'admin répond « Administration non configurée » (503).
Choisis toi-même une longue chaîne aléatoire comme mot de passe.

```
wrangler secret put ADMIN_TOKEN
```

---

## Côté front (pages) — pas des secrets, juste des identifiants publics

Ceux-là se règlent dans le fichier **`consent.js`** (une ligne chacun) — ce sont
des IDs publics, pas des secrets, donc ils vont bien dans le dépôt :

- **`GA_ID`** — ⚠️ à vérifier : la valeur actuelle `G-WTRP1WD9VV` ressemble à la
  propriété d'un autre site (préfixes « cip » = Concept Immo Plus). Confirme dans
  GA4 (Admin → Flux de données) l'ID de **francoisleterrier.fr** et remplace-le si
  besoin, sinon tes statistiques partent dans le mauvais compte.
- **`FB_PIXEL_ID`** — colle ton identifiant de **Pixel Meta** pour activer le suivi
  Meta/Facebook Ads. Laissé vide = désactivé. Le bandeau de consentement et la CSP
  sont **déjà prêts** : dès que tu renseignes l'ID, le Pixel se charge (après
  « Accepter ») et « Meta (Facebook) » apparaît automatiquement dans le bandeau.

Les deux ne se chargent **qu'après consentement** (RGPD) — rien ne part avant le
clic « Accepter ».
