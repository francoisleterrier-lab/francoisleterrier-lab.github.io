/**
 * fl-api — Worker « socle » pour francoisleterrier.fr
 * ---------------------------------------------------------------------------
 * Servi sur le sous-domaine  https://api.francoisleterrier.fr/*
 * (le site reste sur GitHub Pages, intact). CORS ouvert au domaine apex.
 * Bindings (voir wrangler.toml) : CACHE (KV), DB (D1), ASSETS (R2).
 * Secrets (JAMAIS dans le dépôt) : env.LLM_API_KEY, env.PAGESPEED_API_KEY.
 *
 * Endpoints (le préfixe /api est optionnel — /health == /api/health) :
 *   GET  /health   → { ok:true, bindings:… }  (test de bout en bout du socle)
 *   POST /generate → stub (Chantier 1)
 *   POST /audit    → stub (Chantier 2)
 *   POST /lead     → stub (Chantier 4)
 *
 * Sécurité : rate-limit par IP (KV), validation des entrées, en-têtes de
 * sécurité + CORS, gestion d'erreurs sans fuite de stack.
 * ---------------------------------------------------------------------------
 */

import { generatePage, aiText } from "./generate.js";
import { runAudit, publicView, barometreStats, runPlaces, placesTextSearch, placeDetails } from "./audit.js";

// Personnalité + connaissances de l'assistant on-site (LLM via Workers AI).
const ASSISTANT_SYSTEM = "Tu es l'assistant du site de François Leterrier, community manager et créateur de sites internet (micro-entreprise) basé à Lavernose-Lacasse (Sud-Toulousain, 31410), qui travaille partout en France (visio + livraison en ligne). Réponds en français, chaleureux et pro, JAMAIS de jargon, en 1 à 3 phrases maximum. Offre et tarifs (à partir de) : sites internet — landing express dès 590 € (1 page), site vitrine dès 1 690 € (jusqu'à 5 pages), sur-mesure dès 2 900 €, référencement local inclus ; réseaux sociaux dès 290 €/mois sans engagement (Essentiel 290, Croissance 490 la plus choisie, Premium 790) ; faire-part digital dès 290 € ; référencement/visibilité Google. « Application » = site web/PWA, jamais une appli native App Store. Oriente vers le bon outil quand c'est utile : audit de présence en ligne gratuit (page /audit.html), générateur de maquette de site (/generateur.html), configurateur qui génère un devis signable en ligne (/configurateur.html), paiement en ligne des formules réseaux ou d'un acompte de site (/abonnement.html), ou le diagnostic gratuit (/contact.html). Programme de parrainage : recommander un pro fait gagner 1 mois de gestion de réseaux offert par filleul qui démarre (page /parrainage.html) — mentionne-le si la personne connaît quelqu'un à recommander. N'invente jamais de prix hors de ceux indiqués ; si tu ne sais pas, propose le diagnostic gratuit. Termine souvent par une invitation à agir (essayer un outil ou demander le diagnostic).";

// Clé publique du formulaire web3forms (déjà utilisée par le site) — sert à
// notifier François de chaque lead par e-mail, sans nouvelle clé/secret.
const W3F_KEY = "65a34e63-ed73-4214-a9b4-bc144d952cd5";

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Cache-Control": "no-store",
};

// Origines autorisées à appeler l'API depuis le navigateur.
const ALLOWED_ORIGINS = new Set([
  "https://francoisleterrier.fr",
  "https://www.francoisleterrier.fr",
]);

// Endpoints « à valeur » : refusés si la requête vient d'une autre origine
// (empêche une copie de la page, hébergée ailleurs, d'utiliser notre moteur).
// /stripe/webhook n'est PAS ici : Stripe appelle serveur-à-serveur (sans Origin) et le corps brut doit rester intact.
const PROTECTED_PATHS = new Set(["/audit", "/generate", "/site", "/lead", "/devis", "/devis/sign", "/assistant", "/ask-article", "/espace", "/checkout"]);

const RATE_LIMITS = {
  "/health": { limit: 60, window: 60 },
  "/generate": { limit: 8, window: 60 },
  "/audit": { limit: 10, window: 60 },
  "/assistant": { limit: 20, window: 60 },
  "/ask-article": { limit: 12, window: 60 },
  "/reactions": { limit: 40, window: 60 },
  "/my-reviews": { limit: 30, window: 60 },
  "/site": { limit: 20, window: 60 },
  "/devis": { limit: 15, window: 60 },
  "/devis/sign": { limit: 10, window: 60 },
  "/lead": { limit: 5, window: 60 },
  "/espace": { limit: 40, window: 60 },
  "/checkout": { limit: 10, window: 60 },
  "/stripe/webhook": { limit: 120, window: 60 },
  "/admin/leads": { limit: 60, window: 60 },
  "/admin/lead-status": { limit: 120, window: 60 },
  "/admin/espace": { limit: 60, window: 60 },
  _default: { limit: 30, window: 60 },
};

// La sauvegarde d'une maquette embarque toute la spec de page (services, faq,
// avis, URLs d'images) : on autorise un corps un peu plus large.
const MAX_BODY_BYTES = 48 * 1024;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function corsHeaders(request) {
  const origin = request.headers.get("Origin");
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      Vary: "Origin",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-Token",
      "Access-Control-Max-Age": "86400",
    };
  }
  return {};
}

/**
 * Requête à refuser : elle vient explicitement d'une AUTRE origine que la nôtre.
 * Un navigateur envoie toujours l'en-tête Origin sur un appel cross-origin →
 * une copie de la page hébergée ailleurs (ex. le site d'un webmaster) est donc
 * bloquée. Sans Origin NI Referer (curl, monitoring) on laisse passer : ça
 * n'aide pas un copieur, qui lui passe forcément par un navigateur.
 */
function originForbidden(request) {
  const origin = request.headers.get("Origin");
  if (origin) return !ALLOWED_ORIGINS.has(origin);
  const ref = request.headers.get("Referer");
  if (ref) { try { return !ALLOWED_ORIGINS.has(new URL(ref).origin); } catch (_) { return false; } }
  return false;
}

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...SECURITY_HEADERS, ...extra },
  });
}

function clientIp(request) {
  const xff = request.headers.get("X-Forwarded-For");
  return (
    request.headers.get("CF-Connecting-IP") ||
    (xff ? xff.split(",")[0].trim() : "") ||
    "0.0.0.0"
  );
}

async function rateLimit(env, ip, routeKey) {
  const cfg = RATE_LIMITS[routeKey] || RATE_LIMITS._default;
  if (!env || !env.CACHE) return { ok: true, remaining: cfg.limit };
  const nowSec = Math.floor(Date.now() / 1000);
  const bucket = Math.floor(nowSec / cfg.window);
  const key = `rl:${routeKey}:${ip}:${bucket}`;
  let count = 0;
  try {
    count = parseInt(await env.CACHE.get(key), 10) || 0;
  } catch (_) {
    /* KV illisible → on ne bloque pas */
  }
  if (count >= cfg.limit) {
    return { ok: false, remaining: 0, retryAfter: cfg.window - (nowSec % cfg.window) };
  }
  try {
    await env.CACHE.put(key, String(count + 1), { expirationTtl: cfg.window + 5 });
  } catch (_) {
    /* écriture KV impossible → on laisse passer */
  }
  return { ok: true, remaining: cfg.limit - count - 1 };
}

async function readJson(request) {
  const ct = request.headers.get("Content-Type") || "";
  if (!ct.includes("application/json")) {
    return { error: json({ ok: false, error: "Content-Type application/json attendu" }, 415) };
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return { error: json({ ok: false, error: "Corps trop volumineux" }, 413) };
  }
  try {
    return { data: raw ? JSON.parse(raw) : {} };
  } catch (_) {
    return { error: json({ ok: false, error: "JSON invalide" }, 400) };
  }
}

function handleHealth(_request, env) {
  return json({
    ok: true,
    service: "fl-api",
    time: new Date().toISOString(),
    bindings: {
      kv: Boolean(env && env.CACHE),
      d1: Boolean(env && env.DB),
      r2: Boolean(env && env.ASSETS),
    },
    // Présence des clés/secrets (booléens seulement — jamais les valeurs) : self-check des intégrations.
    integrations: {
      ai: Boolean(env && env.AI),
      brevo: Boolean(env && env.BREVO_API_KEY),
      places: Boolean(env && env.PLACES_API_KEY),
      pagespeed: Boolean(env && env.PAGESPEED_API_KEY),
      stripe: Boolean(env && env.STRIPE_SECRET_KEY),
      stripe_webhook: Boolean(env && env.STRIPE_WEBHOOK_SECRET),
    },
  });
}

function clampStr(x, max) {
  return typeof x === "string" ? x.trim().slice(0, max) : "";
}

/** POST /generate — génère une page sur-mesure (Workers AI + repli curaté). */
async function handleGenerate(request, env) {
  const parsed = await readJson(request);
  if (parsed.error) return parsed.error;
  const d = parsed.data || {};
  const input = {
    metier: clampStr(d.metier, 80),
    nom: clampStr(d.nom, 80),
    ville: clampStr(d.ville, 80),
    ton: clampStr(d.ton, 40) || "chaleureux",
  };
  if (!input.metier || !input.nom) {
    return json({ ok: false, error: "Champs requis : metier et nom." }, 422);
  }
  const page = await generatePage(env, input, { debug: d.debug === true });
  return json({ ok: true, page });
}

/** POST /audit — audit 360° : renvoie la vue PUBLIQUE, stocke le complet. */
async function handleAudit(request, env) {
  const parsed = await readJson(request);
  if (parsed.error) return parsed.error;
  const d = parsed.data || {};
  const url = clampStr(d.url, 300);
  if (!url) return json({ ok: false, error: "URL requise." }, 422);
  const full = await runAudit(env, { url: url, nom: clampStr(d.nom, 80), ville: clampStr(d.ville, 80) });
  if (!full.ok) return json(full); // site injoignable / erreur → renvoyé tel quel
  const id = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now());
  if (env.CACHE) { try { await env.CACHE.put("audit:" + id, JSON.stringify(full), { expirationTtl: 2592000 }); } catch (_) {} }
  return json(publicView(full, id));
}

/** POST /assistant — assistant on-site branché sur le LLM (Workers AI). */
async function handleAssistant(request, env) {
  const parsed = await readJson(request);
  if (parsed.error) return parsed.error;
  const d = parsed.data || {};
  const msg = clampStr(d.message, 500);
  if (!msg) return json({ ok: false, error: "Message vide." }, 422);
  const history = Array.isArray(d.history) ? d.history.slice(-6).map(function (m) {
    return { role: m && m.role === "user" ? "user" : "assistant", content: clampStr(m && m.content, 500) };
  }).filter(function (m) { return m.content; }) : [];
  const messages = [{ role: "system", content: ASSISTANT_SYSTEM }].concat(history).concat([{ role: "user", content: msg }]);
  const reply = await aiText(env, messages, 300);
  return json({ ok: true, reply: reply || "Je peux vous orienter tout de suite : un audit gratuit de votre site, une maquette générée en direct, ou un diagnostic offert. Que préférez-vous ?" });
}

/** POST /ask-article — mini-chat IA ancré STRICTEMENT sur le texte de l'article envoyé par le front. */
async function handleAskArticle(request, env) {
  const parsed = await readJson(request);
  if (parsed.error) return parsed.error;
  const d = parsed.data || {};
  const q = clampStr(d.q, 400);
  const context = clampStr(d.context, 6000);
  if (!q) return json({ ok: false, error: "Question vide." }, 422);
  if (!context) return json({ ok: true, reply: "Je réponds à partir du contenu de l'article, mais je n'en ai pas reçu le texte. Rechargez la page de l'article et réessayez." });
  const system = "Tu es l'assistant du blog de François Leterrier (community manager & création de site web, Sud-Toulousain, national à distance). "
    + "Réponds à la question UNIQUEMENT à partir de l'EXTRAIT d'article ci-dessous. Si la réponse ne s'y trouve pas, dis-le simplement et invite à contacter François — n'invente JAMAIS de prix, de chiffre ni de fait absent de l'extrait. "
    + "Réponds en français, clair et concret, en 2 à 5 phrases.\n\nEXTRAIT DE L'ARTICLE :\n" + context;
  const messages = [{ role: "system", content: system }, { role: "user", content: q }];
  const reply = await aiText(env, messages, 260);
  return json({ ok: true, reply: reply || "Je n'ai pas trouvé la réponse dans cet article. Pour un conseil personnalisé, écrivez à François via la page contact." });
}

const REACT_TYPES = new Set(["utile", "coeur", "waouh"]);
function reactSlugOk(s) { return /^[a-z0-9-]{1,80}$/.test(s); }
/** GET/POST /reactions — compteurs de réactions par article (KV, sans compte). */
async function handleReactions(request, env) {
  const empty = { utile: 0, coeur: 0, waouh: 0 };
  if (request.method === "GET") {
    const slug = clampStr(new URL(request.url).searchParams.get("slug") || "", 80);
    if (!reactSlugOk(slug)) return json({ ok: false, error: "slug invalide" }, 400);
    let counts = Object.assign({}, empty);
    if (env.CACHE) { try { const v = await env.CACHE.get("react:" + slug, "json"); if (v) counts = Object.assign(counts, v); } catch (_) {} }
    return json({ ok: true, counts: counts });
  }
  const parsed = await readJson(request);
  if (parsed.error) return parsed.error;
  const d = parsed.data || {};
  const slug = clampStr(d.slug, 80);
  const type = clampStr(d.type, 12);
  if (!reactSlugOk(slug) || !REACT_TYPES.has(type)) return json({ ok: false, error: "paramètres invalides" }, 400);
  let counts = Object.assign({}, empty);
  if (env.CACHE) {
    try { const v = await env.CACHE.get("react:" + slug, "json"); if (v) counts = Object.assign(counts, v); } catch (_) {}
    counts[type] = (counts[type] || 0) + 1;
    try { await env.CACHE.put("react:" + slug, JSON.stringify(counts)); } catch (_) {}
  } else { counts[type] = 1; }
  return json({ ok: true, counts: counts });
}

/** GET /my-reviews — note + volume d'avis Google de François, via l'API Places (caché 12 h). */
// Liste des requêtes candidates pour retrouver la fiche Google Business de François.
// La 1re est le nom EXACT de la fiche (confirmé via le lien de partage Google).
function myPlaceCandidates(env) {
  if (env && env.MY_PLACE_QUERY && env.MY_PLACE_QUERY.trim()) return [env.MY_PLACE_QUERY.trim()];
  return [
    "François Leterrier - Community Manager & Création de site",
    "François Leterrier Community Manager Création de site",
    "François Leterrier Lavernose-Lacasse",
    "François Leterrier community manager Sud-Toulousain",
    "François Leterrier création site internet Lavernose-Lacasse",
    "FL-System Lavernose-Lacasse",
    "Faire-part Vivant Lavernose-Lacasse",
  ];
}

// Le nom d'une fiche prouve-t-il sans ambiguïté qu'il s'agit bien de François ?
// (« Leterrier » + une activité). Protège contre les homonymes.
function nameIsMe(name) {
  const n = (name || "").toLowerCase();
  return /leterrier/.test(n) && /(community|manager|cr[ée]ation|creation|\bsite\b|faire-part|fl-system)/.test(n);
}

// Garde-fou anti-homonyme : identité prouvée par le site lié (francoisleterrier.fr)
// OU par un nom de fiche sans ambiguïté.
function isMyPlace(r) {
  if (!r || !r.found || r.reviews == null || r.rating == null) return false;
  if (r.website && /francoisleterrier\.fr/i.test(r.website)) return true;
  return nameIsMe(r.name);
}

// Résout la fiche Google Business de François, dans l'ordre du plus fiable/économe :
//  1) place_id explicite (env.MY_PLACE_ID) -> 1 seul appel Details ;
//  2) findplacefromtext (exact, rapide) ;
//  3) Text Search (filet large) filtré par identité -> Details.
// Renvoie l'objet fiche accepté, ou null.
async function findMyPlace(env, trace) {
  if (env && env.MY_PLACE_ID && env.MY_PLACE_ID.trim()) {
    const det = await placeDetails(env, env.MY_PLACE_ID.trim());
    if (trace) trace.push({ via: "place_id", id: env.MY_PLACE_ID.trim(), name: det && det.name, rating: det && det.rating, total: det && det.reviews, accept: isMyPlace(det) });
    if (isMyPlace(det)) return det;
  }
  const cands = myPlaceCandidates(env);
  for (let i = 0; i < cands.length; i++) {
    const q = cands[i];
    const r = await runPlaces(env, q);
    if (trace) trace.push({ via: "find", q: q, found: !!(r && r.found), name: r && r.name, rating: r && r.rating, total: r && r.reviews, website: r && r.website, accept: isMyPlace(r) });
    if (isMyPlace(r)) return r;
    // Text Search seulement sur les 3 requêtes les plus fortes (coût API borné).
    if (i < 3) {
      const list = await placesTextSearch(env, q);
      for (let k = 0; k < list.length && k < 5; k++) {
        const c = list[k];
        if (!c.place_id || !nameIsMe(c.name)) continue;
        const det = await placeDetails(env, c.place_id);
        if (trace) trace.push({ via: "textsearch", q: q, id: c.place_id, name: det && det.name, rating: det && det.rating, total: det && det.reviews, website: det && det.website, accept: isMyPlace(det) });
        if (isMyPlace(det)) return det;
      }
    }
  }
  return null;
}

async function handleMyReviews(request, env) {
  const _sp = new URL(request.url).searchParams;
  const nocache = _sp.get("nocache") === "1";
  let data = null;
  if (env.CACHE && !nocache) { try { data = await env.CACHE.get("myreviews_v1", "json"); } catch (_) {} }
  if (!data) {
    const r = await findMyPlace(env, null);
    data = r ? { ok: true, rating: r.rating, total: r.reviews, mapUrl: r.mapUrl || "" } : { ok: false };
    // Cache positif 12 h, négatif 6 h : borne le coût API Places tant que la
    // fiche n'est pas résolvable (indépendant sans adresse publique).
    if (env.CACHE) { try { await env.CACHE.put("myreviews_v1", JSON.stringify(data), { expirationTtl: data.ok ? 43200 : 21600 }); } catch (_) {} }
  }
  return json(data);
}

/** GET /barometre — agrégats anonymisés pour le baromètre GEO (public, caché 30 min). */
async function handleBarometre(request, env) {
  let data = null;
  if (env && env.CACHE) { try { data = await env.CACHE.get("barometre_v2", "json"); } catch (_) {} }
  if (!data) {
    const stats = await barometreStats(env);
    data = { ok: true, stats: stats, generated: new Date().toISOString() };
    if (env && env.CACHE) { try { await env.CACHE.put("barometre_v2", JSON.stringify(data), { expirationTtl: 1800 }); } catch (_) {} }
  }
  return json(data);
}

/** GET /audit?id=… — rapport partageable : renvoie la vue PUBLIQUE stockée. */
async function handleGetAuditReport(request, env) {
  const id = clampStr(new URL(request.url).searchParams.get("id") || "", 60);
  if (!id) return json({ ok: false, error: "Identifiant manquant." }, 400);
  let full = null;
  if (env.CACHE) { try { full = await env.CACHE.get("audit:" + id, "json"); } catch (_) {} }
  if (!full || !full.ok) return json({ ok: false, error: "Rapport introuvable ou expiré." }, 404);
  return json(publicView(full, id));
}

async function sha256hex(s) {
  try {
    const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s || ""));
    return Array.from(new Uint8Array(b)).map(function (x) { return x.toString(16).padStart(2, "0"); }).join("").slice(0, 32);
  } catch (_) { return ""; }
}

/** Notifie François par e-mail (web3forms) — inclut le plan COMPLET (avec actions). */
async function notifyLead(lead) {
  try {
    const audit = lead.audit || {};
    const plan = (audit.plan || []).map(function (p, i) { return (i + 1) + ". " + p.title + "\n   Pourquoi : " + p.why + "\n   Action : " + p.action; }).join("\n");
    const weak = (audit.checks || []).filter(function (c) { return !c.ok; }).map(function (c) { return "✗ " + c.label + (c.detail ? " (" + c.detail + ")" : ""); }).join("\n");
    const msg = "NOUVEAU LEAD — Audit de site\n\nEmail : " + lead.email + "\nSite : " + (lead.url || "") +
      "\nScore global : " + (audit.overall != null ? audit.overall + "/100" : "?") +
      (audit.scores ? "\nPerf mobile : " + audit.scores.perf + "/100 · SEO " + audit.scores.seo + " · A11y " + audit.scores.a11y : "") +
      "\nSignal local : " + ((audit.local && audit.local.score) || 0) + "/4\n\nPOINTS À CORRIGER :\n" + (weak || "—") +
      "\n\nPLAN D'ACTION COMPLET :\n" + (plan || "—");
    await fetch("https://api.web3forms.com/submit", {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ access_key: W3F_KEY, subject: "🎯 Lead audit — " + (lead.url || ""), from_name: "FL Audit", email: lead.email, message: msg }),
    });
  } catch (_) {}
}

/** Notifie François d'un lead « assistant » (rappel depuis le chat) ou « parrainage ». */
async function notifyContactLead(lead) {
  try {
    const c = lead.contact || {};
    const isParr = c.source === "parrainage";
    const convo = (c.convo || "").slice(0, 1500);
    const msg = (isParr ? "NOUVEAU PARRAINAGE 🤝" : "NOUVEAU LEAD — Assistant du site") + "\n\n" +
      (isParr ? "Parrain" : "Nom") + " : " + (c.nom || "?") + "\nEmail : " + lead.email +
      (c.tel ? "\nTéléphone : " + c.tel : "") +
      (c.message ? "\n\n" + (isParr ? "Détails" : "Sa demande") + " :\n" + c.message : "") +
      (convo ? "\n\n--- Fil de la conversation ---\n" + convo : "");
    await fetch("https://api.web3forms.com/submit", {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ access_key: W3F_KEY, subject: (isParr ? "🤝 Parrainage — " : "📞 Lead assistant — ") + (c.nom || lead.email), from_name: isParr ? "FL Parrainage" : "FL Assistant", email: lead.email, message: msg }),
    });
  } catch (_) {}
}

/**
 * Synchronise un lead vers Brevo (ex-Sendinblue) pour les relances automatiques.
 * No-op tant que BREVO_API_KEY n'est pas configurée en secret Cloudflare — aucune clé dans le repo.
 */
async function syncBrevo(env, lead) {
  if (!env || !env.BREVO_API_KEY || !lead || !lead.email) return;
  try {
    const c = lead.contact || {};
    const body = {
      email: lead.email,
      updateEnabled: true,
      attributes: { PRENOM: c.nom || "", SMS: c.tel || "", SOURCE: lead.source || "site" },
    };
    const listId = parseInt(env.BREVO_LIST_ID || "", 10);
    if (listId) body.listIds = [listId];
    await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
  } catch (_) {}
}

/** Crée/complète la table leads si besoin (D1 auto-provisionné, sans wrangler). */
async function ensureSchema(env) {
  if (!env || !env.DB) return;
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS leads (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL DEFAULT (datetime('now')), nom TEXT, email TEXT, telephone TEXT, metier TEXT, besoin TEXT, ville TEXT, budget TEXT, message TEXT, source TEXT, ip_hash TEXT, status TEXT DEFAULT 'nouveau')"
  ).run();
  // Table préexistante sans colonne status → on l'ajoute (ignore si déjà là).
  try { await env.DB.prepare("ALTER TABLE leads ADD COLUMN status TEXT DEFAULT 'nouveau'").run(); } catch (_) {}
}

async function storeLead(env, lead) {
  const ts = new Date().toISOString();
  const ipHash = await sha256hex(lead.ip || "");
  const inp = (lead.site && lead.site.input) || {};
  const ville = inp.ville || "";
  const nom = inp.nom || "";
  const metier = inp.metier || "";
  const message = JSON.stringify({ url: lead.url, audit: lead.audit, site: lead.site }).slice(0, 90000);
  if (env && env.DB) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await env.DB.prepare("INSERT INTO leads (created_at,nom,email,metier,ville,source,message,ip_hash) VALUES (?,?,?,?,?,?,?,?)")
          .bind(ts, nom, lead.email, metier, ville, lead.source || "audit", message, ipHash).run();
        await syncBrevo(env, lead); // relances automatiques (no-op sans clé Brevo)
        return "d1";
      } catch (_) {
        if (attempt === 0) { try { await ensureSchema(env); } catch (_e) {} continue; } // 1er échec = table absente → on la crée et on retente
      }
    }
  }
  if (env && env.CACHE) { try { await env.CACHE.put("lead:" + ts + ":" + (crypto.randomUUID ? crypto.randomUUID() : ""), JSON.stringify({ email: lead.email, url: lead.url, source: lead.source || "audit", site: lead.site || null, ts: ts }), { expirationTtl: 31536000 }); } catch (_) {} }
  await syncBrevo(env, lead); // relances automatiques (no-op sans clé Brevo)
  return "kv";
}

/** Notifie François d'un lead « générateur » (avec le lien de la maquette). */
async function notifyGenLead(lead) {
  try {
    const s = lead.site || {}, inp = s.input || {}, ed = s.edits || {};
    const link = s.id ? "https://francoisleterrier.fr/generateur.html?site=" + s.id : "";
    const msg = "NOUVEAU LEAD — Générateur de site\n\nEmail : " + lead.email +
      "\nMétier : " + (inp.metier || "?") + "\nÉtablissement : " + (inp.nom || "?") +
      "\nVille : " + (inp.ville || "?") + "\nStyle choisi : " + (ed.ton || inp.ton || "?") +
      (ed.accent ? "\nCouleur d'accent : " + ed.accent : "") +
      (link ? "\n\nMaquette partageable : " + link : "");
    await fetch("https://api.web3forms.com/submit", {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ access_key: W3F_KEY, subject: "🎨 Lead générateur — " + (inp.nom || inp.metier || ""), from_name: "FL Générateur", email: lead.email, message: msg }),
    });
  } catch (_) {}
}

/** Identifiant court url-safe pour les maquettes partagées (12 hex). */
function shortId() {
  const a = new Uint8Array(6);
  if (crypto && crypto.getRandomValues) crypto.getRandomValues(a);
  return Array.from(a).map(function (x) { return ("0" + x.toString(16)).slice(-2); }).join("");
}

/** POST /site — garde une maquette (aspirateur à leads) : e-mail requis. */
async function handleSaveSite(request, env) {
  const parsed = await readJson(request);
  if (parsed.error) return parsed.error;
  const d = parsed.data || {};
  const email = clampStr(d.email, 120);
  if (!email || !EMAIL_RE.test(email)) return json({ ok: false, error: "Adresse e-mail invalide." }, 422);
  const page = d.page && typeof d.page === "object" ? d.page : null;
  if (!page) return json({ ok: false, error: "Maquette manquante." }, 422);
  const edits = d.edits && typeof d.edits === "object" ? d.edits : {};
  const input = d.input && typeof d.input === "object" ? d.input : {};
  const id = shortId();
  if (env.CACHE) { try { await env.CACHE.put("site:" + id, JSON.stringify({ page: page, edits: edits, input: input }), { expirationTtl: 15552000 }); } catch (_) {} } // 180 jours
  const lead = { email: email, url: "", source: "generateur", ip: clientIp(request), site: { input: input, edits: edits, id: id } };
  await Promise.all([notifyGenLead(lead), storeLead(env, lead)]);
  return json({ ok: true, id: id });
}

/** GET /site?id=… — renvoie la maquette pour la vue partagée (sans e-mail). */
async function handleGetSite(request, env) {
  const id = clampStr(new URL(request.url).searchParams.get("id") || "", 40);
  if (!id || !/^[a-f0-9]{6,40}$/i.test(id)) return json({ ok: false, error: "Identifiant manquant." }, 400);
  let rec = null;
  if (env.CACHE) { try { rec = await env.CACHE.get("site:" + id, "json"); } catch (_) {} }
  if (!rec || !rec.page) return json({ ok: false, error: "Maquette introuvable ou expirée." }, 404);
  return json({ ok: true, page: rec.page, edits: rec.edits || {} });
}

/* -------------------- Back-office privé (leads) -------------------- */

/** Comparaison à temps constant (évite les attaques par timing sur le token). */
function timingSafeEqual(a, b) {
  a = String(a || ""); b = String(b || "");
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Vérifie le token admin (secret env.ADMIN_TOKEN — jamais dans le dépôt). */
function checkAdmin(request, env) {
  if (!env || !env.ADMIN_TOKEN) return { ok: false, code: 503, error: "Administration non configurée." };
  const h = request.headers.get("Authorization") || "";
  const tok = h.slice(0, 7).toLowerCase() === "bearer " ? h.slice(7).trim() : (request.headers.get("X-Admin-Token") || "").trim();
  if (!tok || !timingSafeEqual(tok, env.ADMIN_TOKEN)) return { ok: false, code: 401, error: "Accès refusé." };
  return { ok: true };
}

/** Transforme une ligne D1 en lead exploitable par le tableau de bord. */
function parseLeadRow(r) {
  let meta = {};
  try { meta = JSON.parse(r.message || "{}"); } catch (_) {}
  const site = meta.site || null, audit = meta.audit || null;
  const inp = (site && site.input) || {};
  return {
    id: r.id,
    date: r.created_at,
    email: r.email || "",
    source: r.source || "",
    ville: r.ville || inp.ville || "",
    status: r.status || "nouveau",
    metier: r.metier || inp.metier || "",
    nom: r.nom || inp.nom || "",
    url: meta.url || "",
    tel: (site && site.contact && site.contact.tel) || "",
    note: (site && site.contact && site.contact.message) || "",
    score: audit && audit.overall != null ? audit.overall : null,
    shareId: site && site.id ? site.id : null,
  };
}

/** GET /admin/leads — liste tous les leads (auth requise). */
async function handleAdminLeads(request, env) {
  const auth = checkAdmin(request, env);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.code);
  try { await ensureSchema(env); } catch (_) {}
  let rows = [];
  if (env && env.DB) {
    try {
      const res = await env.DB.prepare("SELECT id,created_at,nom,email,metier,ville,source,message,status FROM leads ORDER BY datetime(created_at) DESC LIMIT 1000").all();
      rows = (res && res.results) || [];
    } catch (_) {}
  }
  return json({ ok: true, leads: rows.map(parseLeadRow) });
}

/** POST /admin/lead-status — met à jour le statut d'un lead (auth requise). */
async function handleAdminStatus(request, env) {
  const auth = checkAdmin(request, env);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.code);
  const parsed = await readJson(request);
  if (parsed.error) return parsed.error;
  const d = parsed.data || {};
  const id = parseInt(d.id, 10);
  const status = clampStr(d.status, 20);
  const ALLOWED = ["nouveau", "contacte", "converti", "perdu"];
  if (!id || ALLOWED.indexOf(status) < 0) return json({ ok: false, error: "Paramètres invalides." }, 422);
  try { await ensureSchema(env); } catch (_) {}
  try {
    await env.DB.prepare("UPDATE leads SET status=? WHERE id=?").bind(status, id).run();
  } catch (_) { return json({ ok: false, error: "Mise à jour impossible." }, 500); }
  return json({ ok: true });
}

/** POST /lead — capture email (aspirateur à leads) : notifie + stocke l'audit complet. */
async function handleLead(request, env) {
  const parsed = await readJson(request);
  if (parsed.error) return parsed.error;
  const d = parsed.data || {};
  const email = clampStr(d.email, 120);
  if (!email || !EMAIL_RE.test(email)) return json({ ok: false, error: "Adresse e-mail invalide." }, 422);
  const url = clampStr(d.url, 300), auditId = clampStr(d.auditId, 60), source = clampStr(d.source, 40) || "audit";
  // Capture « rappel » (assistant) ou « parrainage » : nom + tél + demande → /admin + e-mail dédié.
  if (source === "assistant" || source === "parrainage") {
    const nom = clampStr(d.nom, 80), tel = clampStr(d.tel, 30), convo = clampStr(d.convo, 1500);
    let note = clampStr(d.message, 800);
    if (source === "parrainage") {
      const filleul = clampStr(d.filleul, 200);
      note = (filleul ? "Filleul : " + filleul : "") + (filleul && note ? " — " : "") + note;
    }
    const lead = { email: email, url: "", source: source, ip: clientIp(request),
      contact: { nom: nom, tel: tel, message: note, convo: convo, source: source },
      site: { input: { nom: nom, ville: "", metier: "" }, contact: { tel: tel, message: note } } };
    await Promise.all([notifyContactLead(lead), storeLead(env, lead)]);
    return json({ ok: true });
  }
  let audit = null;
  if (auditId && env.CACHE) { try { audit = await env.CACHE.get("audit:" + auditId, "json"); } catch (_) {} }
  const lead = { email: email, url: url, source: source, audit: audit, ip: clientIp(request) };
  await Promise.all([notifyLead(lead), storeLead(env, lead)]);
  return json({ ok: true });
}

/* -------------------- Devis instantané signable (Chantier 4) -------------------- */

/** Notifie François (web3forms) à la création puis à la signature d'un devis. */
async function notifyDevis(rec, etat) {
  try {
    const lignes = (rec.items || []).map(function (it) { return "• " + it.label + " : " + it.amount + " €"; }).join("\n");
    const msg = "DEVIS " + etat + "\n\nClient : " + (rec.client.nom || "") + " <" + rec.client.email + ">" +
      (rec.client.tel ? " · " + rec.client.tel : "") + (rec.client.ville ? " · " + rec.client.ville : "") +
      "\nProjet : " + (rec.projet || "—") + (rec.delay ? " · délai " + rec.delay : "") +
      "\n\n" + lignes + "\n\nTOTAL : " + rec.total + " €" + (rec.monthly ? " + " + rec.monthly + " €/mois" : "") +
      (rec.signature ? "\n\n✍️ SIGNÉ par " + rec.signature.name + " le " + rec.signature.date : "") +
      "\n\nLien du devis : https://francoisleterrier.fr/devis.html?id=" + rec.id;
    await fetch("https://api.web3forms.com/submit", {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ access_key: W3F_KEY, subject: "🧾 Devis " + etat + " — " + (rec.client.nom || rec.client.email), from_name: "FL Devis", email: rec.client.email, message: msg }),
    });
  } catch (_) {}
}

/** POST /devis — crée un devis signable (lead chaud + engagement). */
async function handleCreateDevis(request, env) {
  const parsed = await readJson(request);
  if (parsed.error) return parsed.error;
  const d = parsed.data || {};
  const client = d.client && typeof d.client === "object" ? d.client : {};
  const email = clampStr(client.email, 120);
  if (!email || !EMAIL_RE.test(email)) return json({ ok: false, error: "Adresse e-mail invalide." }, 422);
  const items = Array.isArray(d.items) ? d.items.slice(0, 40).map(function (it) { return { label: clampStr(it.label, 120), amount: Math.max(0, Math.round(Number(it.amount) || 0)) }; }).filter(function (it) { return it.label; }) : [];
  if (!items.length) return json({ ok: false, error: "Le devis est vide." }, 422);
  const rec = {
    id: shortId(), ts: new Date().toISOString(),
    client: { nom: clampStr(client.nom, 100), email: email, tel: clampStr(client.tel, 30), ville: clampStr(client.ville, 80) },
    items: items,
    total: Math.max(0, Math.round(Number(d.total) || 0)),
    monthly: Math.max(0, Math.round(Number(d.monthly) || 0)),
    delay: clampStr(d.delay, 40), projet: clampStr(d.projet, 80), message: clampStr(d.message, 500),
    validityDays: 30, status: "sent", signature: null,
  };
  if (env.CACHE) { try { await env.CACHE.put("devis:" + rec.id, JSON.stringify(rec), { expirationTtl: 15552000 }); } catch (_) {} }
  const lead = { email: email, url: "", source: "devis", ip: clientIp(request), site: { input: { metier: rec.projet, nom: rec.client.nom, ville: rec.client.ville }, id: rec.id } };
  await Promise.all([notifyDevis(rec, "créé"), storeLead(env, lead)]);
  return json({ ok: true, id: rec.id });
}

/** GET /devis?id=… — renvoie le devis pour affichage/signature (sans l'IP). */
async function handleGetDevis(request, env) {
  const id = clampStr(new URL(request.url).searchParams.get("id") || "", 40);
  if (!id || !/^[a-f0-9]{6,40}$/i.test(id)) return json({ ok: false, error: "Identifiant manquant." }, 400);
  let rec = null;
  if (env.CACHE) { try { rec = await env.CACHE.get("devis:" + id, "json"); } catch (_) {} }
  if (!rec) return json({ ok: false, error: "Devis introuvable ou expiré." }, 404);
  if (rec.signature) rec.signature = { name: rec.signature.name, date: rec.signature.date }; // pas l'ip_hash
  return json({ ok: true, devis: rec });
}

/** POST /devis/sign — signature électronique (bon pour accord). */
async function handleSignDevis(request, env) {
  const parsed = await readJson(request);
  if (parsed.error) return parsed.error;
  const d = parsed.data || {};
  const id = clampStr(d.id, 40), name = clampStr(d.name, 100);
  if (!id || !name || name.length < 2) return json({ ok: false, error: "Nom requis pour signer." }, 422);
  let rec = null;
  if (env.CACHE) { try { rec = await env.CACHE.get("devis:" + id, "json"); } catch (_) {} }
  if (!rec) return json({ ok: false, error: "Devis introuvable." }, 404);
  if (rec.status === "signed") return json({ ok: true, already: true });
  rec.status = "signed";
  rec.signature = { name: name, date: new Date().toISOString(), ip_hash: await sha256hex(clientIp(request)) };
  if (env.CACHE) { try { await env.CACHE.put("devis:" + id, JSON.stringify(rec), { expirationTtl: 15552000 }); } catch (_) {} }
  await notifyDevis(rec, "SIGNÉ");
  return json({ ok: true });
}

/* -------------------- Espace client (statistiques Looker Studio) -------------------- */

/** Transforme un nom en identifiant d'URL sûr (a-z0-9-, 2 à 42 car.). */
function slugify(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 42);
}

/** N'autorise QUE des rapports Looker Studio en iframe (anti-injection d'iframe arbitraire). */
function isLookerUrl(u) {
  try {
    const url = new URL(u);
    if (url.protocol !== "https:") return false;
    const h = url.hostname.toLowerCase();
    return h === "lookerstudio.google.com" || h === "datastudio.google.com";
  } catch (_) { return false; }
}

async function espaceIndex(env) {
  let idx = [];
  if (env && env.CACHE) { try { idx = await env.CACHE.get("espaces:index", "json"); } catch (_) {} }
  return Array.isArray(idx) ? idx : [];
}

/** GET /espace?c=slug — vue PUBLIQUE d'un espace client (slug = jeton d'accès non devinable). */
async function handleEspace(request, env) {
  const url = new URL(request.url);
  const slug = clampStr(url.searchParams.get("c"), 42).toLowerCase();
  if (!slug) return json({ ok: false, error: "Identifiant manquant." }, 400);
  let rec = null;
  if (env && env.CACHE) { try { rec = await env.CACHE.get("espace:" + slug, "json"); } catch (_) {} }
  if (!rec) return json({ ok: false, error: "Espace introuvable." }, 404);
  return json({ ok: true, name: rec.name || "", report: rec.report || "" });
}

/** GET /admin/espace — liste les espaces clients (auth requise). */
async function handleAdminEspaceList(request, env) {
  const auth = checkAdmin(request, env);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.code);
  const idx = await espaceIndex(env);
  const espaces = [];
  for (const slug of idx) {
    let rec = null;
    if (env && env.CACHE) { try { rec = await env.CACHE.get("espace:" + slug, "json"); } catch (_) {} }
    if (rec) espaces.push({ slug: slug, name: rec.name || "", report: rec.report || "", updated: rec.updated || "" });
  }
  return json({ ok: true, espaces: espaces });
}

/** POST /admin/espace — crée / met à jour / supprime un espace client (auth requise). */
async function handleAdminEspace(request, env) {
  const auth = checkAdmin(request, env);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.code);
  const parsed = await readJson(request);
  if (parsed.error) return parsed.error;
  const d = parsed.data || {};
  const slug = slugify(d.slug || d.name);
  if (!/^[a-z0-9][a-z0-9-]{1,41}$/.test(slug)) return json({ ok: false, error: "Identifiant client invalide." }, 422);
  if (d.remove) {
    if (env && env.CACHE) { try { await env.CACHE.delete("espace:" + slug); } catch (_) {} }
    const idx = (await espaceIndex(env)).filter(function (s) { return s !== slug; });
    if (env && env.CACHE) { try { await env.CACHE.put("espaces:index", JSON.stringify(idx)); } catch (_) {} }
    return json({ ok: true, removed: slug });
  }
  const name = clampStr(d.name, 80);
  const report = clampStr(d.report, 500);
  if (!name) return json({ ok: false, error: "Nom du client requis." }, 422);
  if (!isLookerUrl(report)) return json({ ok: false, error: "L'URL doit être un rapport Looker Studio (lookerstudio.google.com)." }, 422);
  const rec = { name: name, report: report, updated: new Date().toISOString() };
  if (env && env.CACHE) { try { await env.CACHE.put("espace:" + slug, JSON.stringify(rec)); } catch (_) {} }
  const idx = await espaceIndex(env);
  if (idx.indexOf(slug) < 0) { idx.push(slug); if (env && env.CACHE) { try { await env.CACHE.put("espaces:index", JSON.stringify(idx)); } catch (_) {} } }
  return json({ ok: true, slug: slug, link: "https://francoisleterrier.fr/espace.html?c=" + slug });
}

/* -------------------- Paiement en ligne (Stripe Checkout) --------------------
 * Règle absolue : on ne manipule AUCUNE donnée bancaire et on n'encaisse rien.
 * Stripe héberge toute la saisie de carte (Checkout). Le worker crée seulement
 * la session (avec la clé secrète de François) et lit le webhook signé.
 * Clés uniquement en secrets Cloudflare (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET). */
const SITE_BASE = "https://francoisleterrier.fr";
const STRIPE_PLANS = {
  essentiel: { label: "Réseaux sociaux — Essentiel", amount: 29000 },
  croissance: { label: "Réseaux sociaux — Croissance", amount: 49000 },
  premium: { label: "Réseaux sociaux — Premium", amount: 79000 },
};

async function stripeCreateCheckout(env, pairs) {
  const body = pairs.map(function (p) { return encodeURIComponent(p[0]) + "=" + encodeURIComponent(p[1]); }).join("&");
  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: "Bearer " + env.STRIPE_SECRET_KEY, "Content-Type": "application/x-www-form-urlencoded" },
    body: body,
  });
  const data = await res.json().catch(function () { return null; });
  return { ok: res.ok, status: res.status, data: data };
}

/** POST /checkout — crée une session Stripe Checkout (abonnement réseaux ou acompte site). */
async function handleCheckout(request, env) {
  if (!env || !env.STRIPE_SECRET_KEY) return json({ ok: false, error: "Paiement en ligne pas encore activé." }, 503);
  const parsed = await readJson(request);
  if (parsed.error) return parsed.error;
  const d = parsed.data || {};
  const kind = d.kind === "payment" ? "payment" : "subscription";
  const email = clampStr(d.email, 120);
  const pairs = [];
  if (kind === "subscription") {
    const plan = clampStr(d.plan, 20).toLowerCase();
    const p = STRIPE_PLANS[plan];
    if (!p) return json({ ok: false, error: "Formule inconnue." }, 422);
    pairs.push(["mode", "subscription"], ["line_items[0][quantity]", "1"]);
    const priceId = env["STRIPE_PRICE_" + plan.toUpperCase()];
    if (priceId) {
      pairs.push(["line_items[0][price]", priceId]);
    } else {
      pairs.push(
        ["line_items[0][price_data][currency]", "eur"],
        ["line_items[0][price_data][unit_amount]", String(p.amount)],
        ["line_items[0][price_data][recurring][interval]", "month"],
        ["line_items[0][price_data][product_data][name]", p.label]
      );
    }
    pairs.push(["metadata[kind]", "abonnement"], ["metadata[plan]", plan], ["subscription_data[metadata][plan]", plan]);
  } else {
    const euros = Math.round(Number(d.amount) || 0);
    if (!(euros >= 50 && euros <= 5000)) return json({ ok: false, error: "Montant invalide (entre 50 et 5000 €)." }, 422);
    const label = clampStr(d.label, 80) || "Acompte — projet de site";
    pairs.push(
      ["mode", "payment"], ["line_items[0][quantity]", "1"],
      ["line_items[0][price_data][currency]", "eur"],
      ["line_items[0][price_data][unit_amount]", String(euros * 100)],
      ["line_items[0][price_data][product_data][name]", label],
      ["metadata[kind]", "acompte"], ["metadata[amount_eur]", String(euros)]
    );
  }
  if (email && EMAIL_RE.test(email)) pairs.push(["customer_email", email]);
  pairs.push(
    // Managed Payments est activé par défaut sur certains comptes et exige un
    // tax_code par produit ; on le désactive par requête (micro-entreprise, TVA
    // non applicable art. 293 B) — sinon Stripe refuse la création de session.
    ["managed_payments[enabled]", "false"],
    ["success_url", SITE_BASE + "/abonnement-merci.html?session_id={CHECKOUT_SESSION_ID}"],
    ["cancel_url", SITE_BASE + "/abonnement.html?annule=1"],
    ["allow_promotion_codes", "true"]
  );
  const r = await stripeCreateCheckout(env, pairs);
  if (!r.ok || !r.data || !r.data.url) return json({ ok: false, error: "Création du paiement impossible." }, 502);
  return json({ ok: true, url: r.data.url });
}

async function hmacSha256Hex(secret, payload) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig)).map(function (x) { return x.toString(16).padStart(2, "0"); }).join("");
}

/** Notifie François d'un paiement encaissé (sur SON compte Stripe). */
async function notifyStripe(session, kind, label, email) {
  try {
    const amount = session && session.amount_total != null ? (session.amount_total / 100) : null;
    const name = (session && session.customer_details && session.customer_details.name) || "";
    const msg = "PAIEMENT STRIPE — " + (kind === "acompte" ? "Acompte site" : "Abonnement réseaux") + "\n\n" +
      "Client : " + (name || "?") + (email ? " <" + email + ">" : "") + "\n" + label +
      (amount != null ? "\nMontant : " + amount + " €" + (kind === "abonnement" ? " / mois" : "") : "") +
      "\n\n(Encaissé sur ton compte Stripe.)";
    await fetch("https://api.web3forms.com/submit", {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ access_key: W3F_KEY, subject: "💳 Paiement — " + (name || email || label), from_name: "FL Paiement", email: email || "paiement@francoisleterrier.fr", message: msg }),
    });
  } catch (_) {}
}

/** POST /stripe/webhook — reçoit les événements Stripe (signés). Enregistre le paiement. */
async function handleStripeWebhook(request, env) {
  if (!env || !env.STRIPE_WEBHOOK_SECRET) return json({ ok: false, error: "Webhook non configuré." }, 503);
  const raw = await request.text();
  const sigHeader = request.headers.get("Stripe-Signature") || "";
  let t = "", v1 = "";
  sigHeader.split(",").forEach(function (part) {
    const i = part.indexOf("=");
    if (i < 0) return;
    const k = part.slice(0, i).trim(), val = part.slice(i + 1).trim();
    if (k === "t") t = val; else if (k === "v1" && !v1) v1 = val;
  });
  if (!t || !v1) return json({ ok: false, error: "Signature manquante." }, 400);
  if (Math.abs(Math.floor(Date.now() / 1000) - parseInt(t, 10)) > 300) return json({ ok: false, error: "Horodatage périmé." }, 400);
  const expected = await hmacSha256Hex(env.STRIPE_WEBHOOK_SECRET, t + "." + raw);
  if (!timingSafeEqual(expected, v1)) return json({ ok: false, error: "Signature invalide." }, 400);
  let evt = null;
  try { evt = JSON.parse(raw); } catch (_) { return json({ ok: false, error: "Corps invalide." }, 400); }
  if (evt && evt.type === "checkout.session.completed") {
    const s = (evt.data && evt.data.object) || {};
    const md = s.metadata || {};
    const email = s.customer_email || (s.customer_details && s.customer_details.email) || "";
    const name = (s.customer_details && s.customer_details.name) || "";
    const kind = md.kind === "acompte" ? "acompte" : "abonnement";
    const label = kind === "acompte" ? ("Acompte" + (md.amount_eur ? " " + md.amount_eur + " €" : "")) : ("Abonnement réseaux — " + (md.plan || ""));
    const lead = { email: email || "client-stripe@francoisleterrier.fr", url: "", source: kind, ip: "",
      contact: { nom: name, tel: "", message: label, source: kind },
      site: { input: { nom: name }, contact: { tel: "", message: label } } };
    await Promise.all([notifyStripe(s, kind, label, email), storeLead(env, lead)]);
  }
  return json({ ok: true, received: true });
}

const ROUTES = {
  "GET /health": (req, env) => handleHealth(req, env),
  "POST /generate": (req, env) => handleGenerate(req, env),
  "POST /audit": (req, env) => handleAudit(req, env),
  "GET /audit": (req, env) => handleGetAuditReport(req, env),
  "GET /barometre": (req, env) => handleBarometre(req, env),
  "POST /assistant": (req, env) => handleAssistant(req, env),
  "POST /ask-article": (req, env) => handleAskArticle(req, env),
  "GET /reactions": (req, env) => handleReactions(req, env),
  "GET /my-reviews": (req, env) => handleMyReviews(req, env),
  "POST /reactions": (req, env) => handleReactions(req, env),
  "POST /site": (req, env) => handleSaveSite(req, env),
  "GET /site": (req, env) => handleGetSite(req, env),
  "POST /lead": (req, env) => handleLead(req, env),
  "POST /devis": (req, env) => handleCreateDevis(req, env),
  "GET /devis": (req, env) => handleGetDevis(req, env),
  "POST /devis/sign": (req, env) => handleSignDevis(req, env),
  "GET /espace": (req, env) => handleEspace(req, env),
  "GET /admin/leads": (req, env) => handleAdminLeads(req, env),
  "POST /admin/lead-status": (req, env) => handleAdminStatus(req, env),
  "GET /admin/espace": (req, env) => handleAdminEspaceList(req, env),
  "POST /admin/espace": (req, env) => handleAdminEspace(req, env),
  "POST /checkout": (req, env) => handleCheckout(req, env),
  "POST /stripe/webhook": (req, env) => handleStripeWebhook(req, env),
};

/** Enlève un éventuel préfixe /api pour que /health == /api/health. */
function normalizePath(pathname) {
  let p = pathname.replace(/\/+$/, "") || "/";
  if (p === "/api") return "/";
  if (p.startsWith("/api/")) p = p.slice(4);
  return p || "/";
}

export default {
  async fetch(request, env, ctx) {
    const cors = corsHeaders(request);
    const path = normalizePath(new URL(request.url).pathname);

    // Préflight CORS.
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: { ...SECURITY_HEADERS, ...cors } });
    }

    const withCors = (resp) => {
      for (const [k, v] of Object.entries(cors)) resp.headers.set(k, v);
      return resp;
    };

    try {
      const ip = clientIp(request);
      const rl = await rateLimit(env, ip, path);
      if (!rl.ok) {
        return withCors(
          json({ ok: false, error: "Trop de requêtes, réessayez plus tard." }, 429, {
            "Retry-After": String(rl.retryAfter),
          })
        );
      }

      // Verrou d'origine : nos endpoints « à valeur » ne servent que notre site
      // (une copie de la page hébergée ailleurs est refusée avant tout traitement).
      if (PROTECTED_PATHS.has(path) && originForbidden(request)) {
        return withCors(json({ ok: false, error: "Origine non autorisée." }, 403));
      }

      const handler = ROUTES[`${request.method} ${path}`];
      if (handler) return withCors(await handler(request, env, ctx));

      const knownPath = Object.keys(ROUTES).some((k) => k.endsWith(" " + path));
      return withCors(json({ ok: false, error: knownPath ? "Méthode non autorisée" : "Endpoint inconnu" }, knownPath ? 405 : 404));
    } catch (_err) {
      return withCors(json({ ok: false, error: "Erreur interne" }, 500));
    }
  },
};
