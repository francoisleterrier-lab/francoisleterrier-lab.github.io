/**
 * fl-api — Worker « socle » pour francoisleterrier.fr
 * ---------------------------------------------------------------------------
 * Monté sur https://francoisleterrier.fr/api/*  (même domaine → pas de CORS).
 * Bindings (voir wrangler.toml) : CACHE (KV), DB (D1), ASSETS (R2).
 * Secrets (JAMAIS dans le dépôt) : env.LLM_API_KEY, env.PAGESPEED_API_KEY
 *   → posés via `wrangler secret put …`, lus côté serveur uniquement.
 *
 * Endpoints :
 *   GET  /api/health   → { ok:true, bindings:… }  (test de bout en bout du socle)
 *   POST /api/generate → stub (Chantier 1 — générateur)
 *   POST /api/audit    → stub (Chantier 2 — audit)
 *   POST /api/lead     → stub (Chantier 4 — leads)
 *
 * Socle de sécurité déjà en place : rate-limit par IP (KV), validation des
 * entrées (Content-Type + taille + JSON), en-têtes de sécurité, gestion
 * d'erreurs sans fuite de stack.
 * ---------------------------------------------------------------------------
 */

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Cache-Control": "no-store",
};

// Quotas par IP et par endpoint : { limit: requêtes, window: secondes }.
const RATE_LIMITS = {
  "/api/health": { limit: 60, window: 60 },
  "/api/generate": { limit: 8, window: 60 },
  "/api/audit": { limit: 10, window: 60 },
  "/api/lead": { limit: 5, window: 60 },
  _default: { limit: 30, window: 60 },
};

const MAX_BODY_BYTES = 16 * 1024; // garde-fou anti-abus sur les POST

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

/** Rate-limit à fenêtre fixe via KV. Dégradation propre si KV absent (dev local). */
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
    /* écriture KV impossible → on laisse passer plutôt que 500 */
  }
  return { ok: true, remaining: cfg.limit - count - 1 };
}

/** Lit + valide un corps JSON de POST (Content-Type, taille, parse). */
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

/** GET /api/health — vérifie que route, déploiement et bindings répondent. */
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

/** Stubs des chantiers — valident déjà l'entrée ; implémentation à venir. */
async function handleStub(name, request) {
  const parsed = await readJson(request);
  if (parsed.error) return parsed.error;
  return json(
    { ok: false, stub: true, endpoint: name, message: `${name} : socle en place, implémentation à venir.` },
    501
  );
}

const ROUTES = {
  "GET /api/health": (req, env) => handleHealth(req, env),
  "POST /api/generate": (req) => handleStub("generate", req),
  "POST /api/audit": (req) => handleStub("audit", req),
  "POST /api/lead": (req) => handleStub("lead", req),
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/"; // normalise le slash final

    if (!path.startsWith("/api/")) {
      return json({ ok: false, error: "Not found" }, 404);
    }

    // Préflight OPTIONS — même domaine, pas de CORS, mais on répond proprement.
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: { Allow: "GET, POST, OPTIONS", ...SECURITY_HEADERS },
      });
    }

    try {
      const ip = clientIp(request);
      const rl = await rateLimit(env, ip, path);
      if (!rl.ok) {
        return json({ ok: false, error: "Trop de requêtes, réessayez plus tard." }, 429, {
          "Retry-After": String(rl.retryAfter),
        });
      }

      const handler = ROUTES[`${request.method} ${path}`];
      if (handler) return await handler(request, env, ctx);

      // Path connu mais mauvaise méthode → 405 ; sinon 404.
      const knownPath = Object.keys(ROUTES).some((k) => k.endsWith(" " + path));
      return json({ ok: false, error: knownPath ? "Méthode non autorisée" : "Endpoint inconnu" }, knownPath ? 405 : 404);
    } catch (_err) {
      // Ne jamais fuiter la stack au client.
      return json({ ok: false, error: "Erreur interne" }, 500);
    }
  },
};
