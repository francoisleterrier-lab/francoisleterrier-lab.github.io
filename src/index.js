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

import { generatePage } from "./generate.js";
import { runAudit, publicView } from "./audit.js";

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

const RATE_LIMITS = {
  "/health": { limit: 60, window: 60 },
  "/generate": { limit: 8, window: 60 },
  "/audit": { limit: 10, window: 60 },
  "/site": { limit: 20, window: 60 },
  "/lead": { limit: 5, window: 60 },
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
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    };
  }
  return {};
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

/** POST /audit — audit instantané : renvoie la vue PUBLIQUE, stocke le complet. */
async function handleAudit(request, env) {
  const parsed = await readJson(request);
  if (parsed.error) return parsed.error;
  const url = clampStr((parsed.data || {}).url, 300);
  if (!url) return json({ ok: false, error: "URL requise." }, 422);
  const full = await runAudit(env, url);
  if (!full.ok) return json(full); // site injoignable / erreur → renvoyé tel quel
  const id = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now());
  if (env.CACHE) { try { await env.CACHE.put("audit:" + id, JSON.stringify(full), { expirationTtl: 2592000 }); } catch (_) {} }
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

async function storeLead(env, lead) {
  const ts = new Date().toISOString();
  const ipHash = await sha256hex(lead.ip || "");
  const ville = (lead.site && lead.site.input && lead.site.input.ville) || "";
  if (env && env.DB) {
    try {
      await env.DB.prepare("INSERT INTO leads (created_at,email,ville,source,message,ip_hash) VALUES (?,?,?,?,?,?)")
        .bind(ts, lead.email, ville, lead.source || "audit", JSON.stringify({ url: lead.url, audit: lead.audit, site: lead.site }).slice(0, 90000), ipHash).run();
      return "d1";
    } catch (_) {}
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

const ROUTES = {
  "GET /health": (req, env) => handleHealth(req, env),
  "POST /generate": (req, env) => handleGenerate(req, env),
  "POST /audit": (req, env) => handleAudit(req, env),
  "POST /site": (req, env) => handleSaveSite(req, env),
  "GET /site": (req, env) => handleGetSite(req, env),
  "POST /lead": (req, env) => handleLead(req, env),
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

      const handler = ROUTES[`${request.method} ${path}`];
      if (handler) return withCors(await handler(request, env, ctx));

      const knownPath = Object.keys(ROUTES).some((k) => k.endsWith(" " + path));
      return withCors(json({ ok: false, error: knownPath ? "Méthode non autorisée" : "Endpoint inconnu" }, knownPath ? 405 : 404));
    } catch (_err) {
      return withCors(json({ ok: false, error: "Erreur interne" }, 500));
    }
  },
};
