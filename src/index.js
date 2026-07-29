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
  "/lead": { limit: 5, window: 60 },
  _default: { limit: 30, window: 60 },
};

const MAX_BODY_BYTES = 16 * 1024;

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

async function handleStub(name, request) {
  const parsed = await readJson(request);
  if (parsed.error) return parsed.error;
  return json(
    { ok: false, stub: true, endpoint: name, message: `${name} : socle en place, implémentation à venir.` },
    501
  );
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

const ROUTES = {
  "GET /health": (req, env) => handleHealth(req, env),
  "POST /generate": (req, env) => handleGenerate(req, env),
  "POST /audit": (req) => handleStub("audit", req),
  "POST /lead": (req) => handleStub("lead", req),
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
