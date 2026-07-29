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
const env = { CACHE: memKV(), DB: {}, ASSETS: {} };
const APEX = "https://francoisleterrier.fr";
const req = (method, path, { body, ct, origin } = {}) =>
  new Request("https://api.francoisleterrier.fr" + path, {
    method,
    headers: {
      "CF-Connecting-IP": "203.0.113.7",
      ...(ct ? { "Content-Type": ct } : {}),
      ...(origin ? { Origin: origin } : {}),
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

// 3) stub lead JSON valide → 501
r = await worker.fetch(req("POST", "/lead", { body: JSON.stringify({ email: "x@y.fr" }), ct: "application/json" }), env);
j = await r.json();
ok(r.status === 501 && j.stub === true, "POST /lead (JSON) → 501 stub");

// 4) validations
r = await worker.fetch(req("POST", "/lead", { body: "x", ct: "text/plain" }), env);
ok(r.status === 415, "POST /lead (mauvais Content-Type) → 415");
r = await worker.fetch(req("POST", "/audit", { body: "{oops", ct: "application/json" }), env);
ok(r.status === 400, "POST /audit (JSON cassé) → 400");

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

console.log(`\n${pass} réussis, ${fail} échoués`);
process.exit(fail ? 1 : 0);
