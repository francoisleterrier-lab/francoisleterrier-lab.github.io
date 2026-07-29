/**
 * Test local du Worker fl-api — sans wrangler, sans réseau, sans compte Cloudflare.
 * Node 22 fournit Request/Response globaux (undici). KV est simulée par une Map.
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

// KV en mémoire pour tester le rate-limit
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
const req = (method, path, { body, ct } = {}) =>
  new Request("https://francoisleterrier.fr" + path, {
    method,
    headers: {
      "CF-Connecting-IP": "203.0.113.7",
      ...(ct ? { "Content-Type": ct } : {}),
    },
    body,
  });

console.log("fl-api — tests du socle");

// 1) health
let r = await worker.fetch(req("GET", "/api/health"), env);
let j = await r.json();
ok(r.status === 200, "GET /api/health → 200");
ok(j.ok === true, "health: ok=true");
ok(j.bindings && j.bindings.kv === true && j.bindings.d1 === true && j.bindings.r2 === true, "health: bindings détectés");
ok(r.headers.get("X-Content-Type-Options") === "nosniff", "headers de sécurité présents");

// 2) stub lead avec JSON valide → 501 (socle en place)
r = await worker.fetch(req("POST", "/api/lead", { body: JSON.stringify({ email: "x@y.fr" }), ct: "application/json" }), env);
j = await r.json();
ok(r.status === 501 && j.stub === true, "POST /api/lead (JSON) → 501 stub");

// 3) mauvais Content-Type → 415
r = await worker.fetch(req("POST", "/api/lead", { body: "x", ct: "text/plain" }), env);
ok(r.status === 415, "POST /api/lead (mauvais Content-Type) → 415");

// 4) JSON invalide → 400
r = await worker.fetch(req("POST", "/api/audit", { body: "{oops", ct: "application/json" }), env);
ok(r.status === 400, "POST /api/audit (JSON cassé) → 400");

// 5) mauvaise méthode sur un endpoint connu → 405
r = await worker.fetch(req("GET", "/api/lead"), env);
ok(r.status === 405, "GET /api/lead → 405 (méthode)");

// 6) endpoint /api inconnu → 404
r = await worker.fetch(req("GET", "/api/nope"), env);
ok(r.status === 404, "GET /api/nope → 404");

// 7) hors /api → 404 (ne touche pas au site statique)
r = await worker.fetch(req("GET", "/index.html"), env);
ok(r.status === 404, "GET /index.html (hors /api) → 404");

// 8) OPTIONS → 204
r = await worker.fetch(req("OPTIONS", "/api/health"), env);
ok(r.status === 204, "OPTIONS /api/health → 204");

// 9) rate-limit : dépasser la limite de /api/health (60/min) → 429
let got429 = false;
for (let i = 0; i < 65; i++) {
  const rr = await worker.fetch(req("GET", "/api/health"), env);
  if (rr.status === 429) {
    got429 = true;
    ok(rr.headers.get("Retry-After") !== null, "429 renvoie Retry-After");
    break;
  }
}
ok(got429, "rate-limit par IP déclenche un 429");

console.log(`\n${pass} réussis, ${fail} échoués`);
process.exit(fail ? 1 : 0);
