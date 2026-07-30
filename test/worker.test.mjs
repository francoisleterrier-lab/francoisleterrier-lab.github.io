/**
 * Test local du Worker fl-api — sans wrangler, sans réseau, sans compte Cloudflare.
 * Node 22+ fournit Request/Response globaux (undici). KV simulée par une Map.
 * Lancer :  npm test   (ou  node test/worker.test.mjs)
 */
import worker from "../src/index.js";

let pass = 0,
  fail = 0;
function ok(cond, label) {
  if (cond) {
    pass++;
    console.log("  ✓ " + label);
  } else {
    fail++;
    console.error("  ✗ " + label);
  }
}

function memKV() {
  const m = new Map();
  return {
    async get(k) {
      return m.has(k) ? m.get(k) : null;
    },
    async put(k, v) {
      m.set(k, v);
    },
  };
}
// Mini-mock D1 (SQLite) : suffisant pour les requêtes du back-office.
function memDB() {
  const rows = [];
  let seq = 0;
  const stmt = (sql) => {
    let args = [];
    return {
      bind(...a) { args = a; return this; },
      async run() {
        if (/^\s*INSERT INTO leads/i.test(sql)) {
          rows.push({ id: ++seq, created_at: args[0], nom: args[1], email: args[2], metier: args[3], ville: args[4], source: args[5], message: args[6], ip_hash: args[7], status: "nouveau" });
        } else if (/UPDATE leads SET status/i.test(sql)) {
          const r = rows.find((x) => x.id === args[1]); if (r) r.status = args[0];
        } // CREATE / ALTER → noop
        return { success: true };
      },
      async all() {
        return { results: rows.slice().sort((a, b) => (a.created_at < b.created_at ? 1 : -1)) };
      },
    };
  };
  return { prepare: (sql) => stmt(sql), _rows: rows };
}

const env = { CACHE: memKV(), DB: {}, ASSETS: {} };
const adminEnv = { CACHE: memKV(), DB: memDB(), ASSETS: {}, ADMIN_TOKEN: "s3cr3t-test-token" };
const APEX = "https://francoisleterrier.fr";
const req = (method, path, { body, ct, origin, token } = {}) =>
  new Request("https://api.francoisleterrier.fr" + path, {
    method,
    headers: {
      "CF-Connecting-IP": "203.0.113.7",
      ...(ct ? { "Content-Type": ct } : {}),
      ...(origin ? { Origin: origin } : {}),
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body,
  });

console.log("fl-api — tests du socle (sous-domaine + CORS)");

// 1) health sur /health ET /api/health (préfixe optionnel)
let r = await worker.fetch(req("GET", "/health"), env);
let j = await r.json();
ok(r.status === 200 && j.ok === true, "GET /health → 200 ok:true");
ok(j.bindings && j.bindings.kv && j.bindings.d1 && j.bindings.r2, "health: bindings détectés");
ok(r.headers.get("X-Content-Type-Options") === "nosniff", "en-têtes de sécurité présents");

r = await worker.fetch(req("GET", "/api/health"), env);
ok(r.status === 200, "GET /api/health → 200 (préfixe /api optionnel)");

// 2) CORS : origine apex autorisée
r = await worker.fetch(req("GET", "/health", { origin: APEX }), env);
ok(r.headers.get("Access-Control-Allow-Origin") === APEX, "CORS: origine apex autorisée");

r = await worker.fetch(req("OPTIONS", "/health", { origin: APEX }), env);
ok(r.status === 204 && r.headers.get("Access-Control-Allow-Origin") === APEX, "OPTIONS préflight → 204 + CORS");

r = await worker.fetch(req("GET", "/health", { origin: "https://evil.example" }), env);
ok(r.headers.get("Access-Control-Allow-Origin") === null, "CORS: origine inconnue refusée");

// 3) lead : validation e-mail (pas d'appel réseau) → 422
r = await worker.fetch(req("POST", "/lead", { body: JSON.stringify({ email: "pas-un-email" }), ct: "application/json" }), env);
ok(r.status === 422, "POST /lead (e-mail invalide) → 422");

// 4) validations
r = await worker.fetch(req("POST", "/lead", { body: "x", ct: "text/plain" }), env);
ok(r.status === 415, "POST /lead (mauvais Content-Type) → 415");
r = await worker.fetch(req("POST", "/audit", { body: "{oops", ct: "application/json" }), env);
ok(r.status === 400, "POST /audit (JSON cassé) → 400");

// 4b) /site : GET sans id → 400 ; POST e-mail invalide → 422 ; POST sans page → 422
r = await worker.fetch(req("GET", "/site"), env);
ok(r.status === 400, "GET /site (sans id) → 400");
r = await worker.fetch(req("POST", "/site", { body: JSON.stringify({ email: "nope", page: {} }), ct: "application/json" }), env);
ok(r.status === 422, "POST /site (e-mail invalide) → 422");
r = await worker.fetch(req("POST", "/site", { body: JSON.stringify({ email: "a@b.fr" }), ct: "application/json" }), env);
ok(r.status === 422, "POST /site (maquette manquante) → 422");
r = await worker.fetch(req("GET", "/site?id=deadbeef", { origin: APEX }), env);
ok(r.status === 404, "GET /site (id inconnu) → 404 (maquette introuvable)");

// 4b-bis) rapport d'audit partageable
r = await worker.fetch(req("GET", "/audit"), env);
ok(r.status === 400, "GET /audit (sans id) → 400");
r = await worker.fetch(req("GET", "/audit?id=inconnu123", { origin: APEX }), env);
ok(r.status === 404, "GET /audit?id inconnu → 404 (rapport introuvable)");

// 4b-ter) devis signable + baromètre (chemins de validation, sans effet réseau)
r = await worker.fetch(req("GET", "/devis"), env);
ok(r.status === 400, "GET /devis (sans id) → 400");
r = await worker.fetch(req("POST", "/devis", { body: JSON.stringify({ client: { email: "nope" }, items: [{ label: "x", amount: 100 }] }), ct: "application/json" }), env);
ok(r.status === 422, "POST /devis (e-mail invalide) → 422");
r = await worker.fetch(req("POST", "/devis", { body: JSON.stringify({ client: { email: "a@b.fr" }, items: [] }), ct: "application/json" }), env);
ok(r.status === 422, "POST /devis (vide) → 422");
r = await worker.fetch(req("GET", "/devis?id=deadbeef", { origin: APEX }), env);
ok(r.status === 404, "GET /devis?id inconnu → 404");
r = await worker.fetch(req("POST", "/devis/sign", { body: JSON.stringify({ id: "x" }), ct: "application/json" }), env);
ok(r.status === 422, "POST /devis/sign (sans nom) → 422");
r = await worker.fetch(req("GET", "/barometre"), env);
ok(r.status === 200, "GET /barometre → 200");
r = await worker.fetch(req("POST", "/assistant", { body: JSON.stringify({ message: "" }), ct: "application/json" }), env);
ok(r.status === 422, "POST /assistant (message vide) → 422");

// 4c) verrou d'origine : les endpoints « à valeur » refusent une autre origine
r = await worker.fetch(req("POST", "/audit", { body: JSON.stringify({ url: "https://x.fr" }), ct: "application/json", origin: "https://evil.example" }), env);
ok(r.status === 403, "POST /audit depuis une origine non autorisée → 403 (anti-copie)");
r = await worker.fetch(req("POST", "/generate", { body: JSON.stringify({ metier: "x", nom: "y" }), ct: "application/json", origin: "https://evil.example" }), env);
ok(r.status === 403, "POST /generate depuis une origine non autorisée → 403");
r = await worker.fetch(req("POST", "/audit", { body: "{cassé", ct: "application/json", origin: APEX }), env);
ok(r.status === 400, "POST /audit depuis l'apex → passe le verrou (400 JSON, pas 403)");

// 5) méthode / inconnu
r = await worker.fetch(req("GET", "/lead"), env);
ok(r.status === 405, "GET /lead → 405 (méthode)");
r = await worker.fetch(req("GET", "/nope"), env);
ok(r.status === 404, "GET /nope → 404");

// 6) OPTIONS
r = await worker.fetch(req("OPTIONS", "/health"), env);
ok(r.status === 204, "OPTIONS /health → 204");

// 7) rate-limit
let got429 = false;
for (let i = 0; i < 65; i++) {
  const rr = await worker.fetch(req("GET", "/health"), env);
  if (rr.status === 429) {
    got429 = true;
    ok(rr.headers.get("Retry-After") !== null, "429 renvoie Retry-After");
    break;
  }
}
ok(got429, "rate-limit par IP déclenche un 429");

// 8) back-office privé (leads)
r = await worker.fetch(req("GET", "/admin/leads"), env); // env sans ADMIN_TOKEN
ok(r.status === 503, "GET /admin/leads sans secret configuré → 503");
r = await worker.fetch(req("GET", "/admin/leads"), adminEnv); // configuré, mais sans jeton
ok(r.status === 401, "GET /admin/leads sans jeton → 401");
r = await worker.fetch(req("GET", "/admin/leads", { token: "mauvais" }), adminEnv);
ok(r.status === 401, "GET /admin/leads mauvais jeton → 401");

// seed d'un lead générateur, puis lecture
await adminEnv.DB.prepare("INSERT INTO leads (created_at,nom,email,metier,ville,source,message,ip_hash) VALUES (?,?,?,?,?,?,?,?)")
  .bind("2026-07-29T10:00:00Z", "Café X", "a@b.fr", "restaurant", "Muret", "generateur",
    JSON.stringify({ url: "", audit: null, site: { input: { metier: "restaurant", nom: "Café X", ville: "Muret" }, id: "abc123" } }), "hash").run();
r = await worker.fetch(req("GET", "/admin/leads", { token: "s3cr3t-test-token" }), adminEnv);
let jl = await r.json();
ok(r.status === 200 && jl.ok === true && Array.isArray(jl.leads) && jl.leads.length >= 1, "GET /admin/leads bon jeton → 200 + liste");
ok(jl.leads[0].source === "generateur" && jl.leads[0].shareId === "abc123" && jl.leads[0].nom === "Café X", "lead générateur correctement parsé");

// maj de statut
const lid = jl.leads[0].id;
r = await worker.fetch(req("POST", "/admin/lead-status", { token: "s3cr3t-test-token", body: JSON.stringify({ id: lid, status: "contacte" }), ct: "application/json" }), adminEnv);
ok(r.status === 200, "POST /admin/lead-status (valide) → 200");
r = await worker.fetch(req("GET", "/admin/leads", { token: "s3cr3t-test-token" }), adminEnv);
jl = await r.json();
ok(jl.leads[0].status === "contacte", "statut mis à jour et relu");
r = await worker.fetch(req("POST", "/admin/lead-status", { token: "s3cr3t-test-token", body: JSON.stringify({ id: lid, status: "bidon" }), ct: "application/json" }), adminEnv);
ok(r.status === 422, "POST /admin/lead-status (statut invalide) → 422");
r = await worker.fetch(req("POST", "/admin/lead-status", { body: JSON.stringify({ id: 1, status: "contacte" }), ct: "application/json" }), adminEnv);
ok(r.status === 401, "POST /admin/lead-status sans jeton → 401");

console.log(`\n${pass} réussis, ${fail} échoués`);
process.exit(fail ? 1 : 0);
