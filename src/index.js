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
import { runAudit, publicView, barometreStats } from "./audit.js";

// Personnalité + connaissances de l'assistant on-site (LLM via Workers AI).
const ASSISTANT_SYSTEM = "Tu es l'assistant du site de François Leterrier, community manager et créateur de sites internet (micro-entreprise) basé à Lavernose-Lacasse (Sud-Toulousain, 31410), qui travaille partout en France (visio + livraison en ligne). Réponds en français, chaleureux et pro, JAMAIS de jargon, en 1 à 3 phrases maximum. Offre et tarifs (à partir de) : sites internet — site vitrine dès 590 € (1 page) ou 1 400 € (jusqu'à 5 pages), référencement local inclus ; réseaux sociaux dès 180 €/mois sans engagement (formule Croissance 350 €/mois, la plus choisie) ; faire-part digital dès 290 € ; référencement/visibilité Google. « Application » = site web/PWA, jamais une appli native App Store. Oriente vers le bon outil quand c'est utile : audit de présence en ligne gratuit (page /audit.html), générateur de maquette de site (/generateur.html), configurateur de devis (/configurateur.html), ou le diagnostic gratuit (/contact.html). N'invente jamais de prix hors de ceux indiqués ; si tu ne sais pas, propose le diagnostic gratuit. Termine souvent par une invitation à agir (essayer un outil ou demander le diagnostic).";

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
const PROTECTED_PATHS = new Set(["/audit", "/generate", "/site", "/lead", "/devis", "/devis/sign", "/assistant"]);

const RATE_LIMITS = {
  "/health": { limit: 60, window: 60 },
  "/generate": { limit: 8, window: 60 },
  "/audit": { limit: 10, window: 60 },
  "/assistant": { limit: 20, window: 60 },
  "/site": { limit: 20, window: 60 },
  "/devis": { limit: 15, window: 60 },
  "/devis/sign": { limit: 10, window: 60 },
  "/lead": { limit: 5, window: 60 },
  "/admin/leads": { limit: 60, window: 60 },
  "/admin/lead-status": { limit: 120, window: 60 },
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
        return "d1";
      } catch (_) {
        if (attempt === 0) { try { await ensureSchema(env); } catch (_e) {} continue; } // 1er échec = table absente → on la crée et on retente
      }
    }
  }
  if (env && env.CACHE) { try { await env.CACHE.put("lead:" + ts + ":" + (crypto.randomUUID ? crypto.randomUUID() : ""), JSON.stringify({ email: lead.email, url: lead.url, source: lead.source || "audit", site: lead.site || null, ts: ts }), { expirationTtl: 31536000 }); } catch (_) {} }
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

const ROUTES = {
  "GET /health": (req, env) => handleHealth(req, env),
  "POST /generate": (req, env) => handleGenerate(req, env),
  "POST /audit": (req, env) => handleAudit(req, env),
  "GET /audit": (req, env) => handleGetAuditReport(req, env),
  "GET /barometre": (req, env) => handleBarometre(req, env),
  "POST /assistant": (req, env) => handleAssistant(req, env),
  "POST /site": (req, env) => handleSaveSite(req, env),
  "GET /site": (req, env) => handleGetSite(req, env),
  "POST /lead": (req, env) => handleLead(req, env),
  "POST /devis": (req, env) => handleCreateDevis(req, env),
  "GET /devis": (req, env) => handleGetDevis(req, env),
  "POST /devis/sign": (req, env) => handleSignDevis(req, env),
  "GET /admin/leads": (req, env) => handleAdminLeads(req, env),
  "POST /admin/lead-status": (req, env) => handleAdminStatus(req, env),
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
