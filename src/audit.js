/**
 * audit.js — Audit instantané d'un site (Chantier 2).
 * Sans clé : analyse SEO (parse serveur) + signal local + plan d'action IA
 * (Workers AI) + capture d'écran (mShots). Avec clé PAGESPEED_API_KEY :
 * scores Lighthouse réels (perf/SEO/accessibilité/best-practices) en bonus.
 */
import { aiJSON } from "./generate.js";

/** Normalise/valide l'URL saisie. Renvoie {url} ou {error}. */
export function normalizeUrl(input) {
  let s = String(input || "").trim();
  if (!s) return { error: "URL manquante" };
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  let u;
  try { u = new URL(s); } catch (_) { return { error: "URL invalide" }; }
  if (!/^https?:$/.test(u.protocol)) return { error: "Protocole non supporté" };
  if (!u.hostname.includes(".")) return { error: "Nom de domaine invalide" };
  return { url: u.toString(), origin: u.origin, host: u.hostname };
}

function attr(html, re) { const m = html.match(re); return m ? (m[1] || "").trim() : ""; }
function count(html, re) { const m = html.match(re); return m ? m.length : 0; }
function decode(s) { return String(s || "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim(); }

/** Parse les signaux SEO/technique depuis le HTML. */
function parseSeo(url, html, headers) {
  const head = (html.match(/<head[\s\S]*?<\/head>/i) || [html])[0];
  const title = decode(attr(head, /<title[^>]*>([\s\S]*?)<\/title>/i));
  const desc = decode(attr(head, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) || attr(head, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i));
  const h1 = count(html, /<h1[\s>]/gi);
  const h2 = count(html, /<h2[\s>]/gi);
  const imgs = count(html, /<img[\s>]/gi);
  const imgsNoAlt = count(html, /<img(?![^>]*\balt=)[^>]*>/gi);
  const jsonld = html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || [];
  const ldTypes = [];
  jsonld.forEach(function (b) { const t = b.match(/"@type"\s*:\s*"([^"]+)"/g) || []; t.forEach(function (x) { ldTypes.push(x.replace(/.*"@type"\s*:\s*"([^"]+)".*/, "$1")); }); });
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
  const words = (text.match(/\S+/g) || []).length;
  const ct = (headers.get("content-type") || "");

  const c = [];
  function chk(id, label, ok, weight, detail) { c.push({ id: id, label: label, ok: !!ok, w: weight, detail: detail || "" }); }
  chk("https", "HTTPS actif", /^https:/i.test(url), 10, url.split(":")[0].toUpperCase());
  chk("title", "Balise title", title && title.length >= 15 && title.length <= 70, 12, title ? title.length + " caractères" : "absente");
  chk("desc", "Meta description", desc && desc.length >= 50 && desc.length <= 175, 10, desc ? desc.length + " caractères" : "absente");
  chk("h1", "Un seul H1", h1 === 1, 10, h1 + " balise(s) H1");
  chk("hn", "Structure Hn", h2 >= 1, 5, h2 + " sous-titres H2");
  chk("viewport", "Balise viewport (mobile)", /name=["']viewport["']/i.test(head), 10, "");
  chk("lang", "Attribut lang", /<html[^>]+lang=/i.test(html), 4, "");
  chk("canonical", "Lien canonical", /rel=["']canonical["']/i.test(head), 5, "");
  chk("og", "Open Graph (partage réseaux)", /property=["']og:(title|image)["']/i.test(head), 8, "");
  chk("jsonld", "Données structurées (schema)", ldTypes.length > 0, 8, ldTypes.length ? ldTypes.slice(0, 4).join(", ") : "aucune");
  chk("favicon", "Favicon", /rel=["'][^"']*icon["']/i.test(head), 3, "");
  chk("alt", "Images avec texte alternatif", imgs === 0 || imgsNoAlt / imgs < 0.3, 5, imgs ? imgsNoAlt + "/" + imgs + " sans alt" : "aucune image");
  chk("content", "Contenu suffisant", words >= 250, 5, words + " mots");
  chk("noindex", "Indexation autorisée", !/name=["']robots["'][^>]+noindex/i.test(head), 5, "");

  return { title: title, desc: desc, h1: h1, h2: h2, words: words, ldTypes: ldTypes, imgs: imgs, imgsNoAlt: imgsNoAlt, checks: c };
}

/** Signal local (fiche Google, NAP). */
function localSignal(html) {
  const localLd = /"@type"\s*:\s*"(LocalBusiness|Restaurant|Store|ProfessionalService|[A-Za-z]*Business)"/i.test(html);
  const tel = /href=["']tel:/i.test(html) || /\b0[1-9]([ .-]?\d{2}){4}\b/.test(html);
  const cp = /\b\d{5}\b/.test(html);
  const gmb = /(g\.page|google\.com\/maps|business\.google|goo\.gl\/maps)/i.test(html);
  const score = (localLd ? 1 : 0) + (tel ? 1 : 0) + (cp ? 1 : 0) + (gmb ? 1 : 0);
  return { schema: localLd, tel: tel, address: cp, googleLink: gmb, score: score };
}

/* ---------- Piliers de présence en ligne (Audit 360°) ---------- */

// Réseaux sociaux détectés dans la page (présence = 1er signal, sans clé).
const SOCIAL_RE = {
  facebook: /facebook\.com\/(?!sharer|share[?/])/i,
  instagram: /instagram\.com\/[a-z0-9_.]/i,
  linkedin: /linkedin\.com\/(company|in|school)\//i,
  tiktok: /tiktok\.com\/@/i,
  youtube: /(youtube\.com\/(channel|c\/|@|user\/)|youtu\.be\/)/i,
  twitter: /(twitter\.com|x\.com)\/(?!intent|share)[a-z0-9_]/i,
  pinterest: /pinterest\.[a-z.]+\/[a-z0-9_]/i,
};
function detectSocial(html) {
  const found = [];
  for (const k in SOCIAL_RE) { if (SOCIAL_RE[k].test(html)) found.push(k); }
  const n = found.length;
  const score = n === 0 ? 0 : n === 1 ? 45 : n === 2 ? 68 : n === 3 ? 85 : 100;
  return { platforms: found, count: n, score: score };
}

// Pilier Fiche Google : signaux on-page, précisés par Places si la clé est là.
function googlePillar(local, places) {
  if (places && places.found) {
    let s = 30;
    if (places.rating != null) s += places.rating >= 4.5 ? 30 : places.rating >= 4 ? 22 : places.rating >= 3 ? 10 : 0;
    if (places.reviews != null) s += places.reviews >= 100 ? 25 : places.reviews >= 30 ? 18 : places.reviews >= 5 ? 10 : 2;
    if (places.hasSite) s += 8;
    return Math.min(100, s);
  }
  let s = 0;
  if (local.googleLink) s += 40;
  if (local.schema) s += 25;
  if (local.address) s += 20;
  if (local.tel) s += 15;
  return Math.min(100, s);
}

// Pilier Avis & réputation : schema on-page, précisé par Places si la clé est là.
function reviewsPillar(html, local, places) {
  if (places && places.found && places.reviews != null) {
    let s = places.reviews >= 100 ? 55 : places.reviews >= 30 ? 42 : places.reviews >= 10 ? 30 : places.reviews >= 3 ? 18 : 5;
    s += places.rating != null ? (places.rating >= 4.5 ? 40 : places.rating >= 4 ? 30 : places.rating >= 3 ? 15 : 5) : 0;
    return Math.min(100, s);
  }
  const hasAgg = /"@type"\s*:\s*"(AggregateRating|Review)"/i.test(html) || /aggregateRating/i.test(html);
  let s = 0;
  if (hasAgg) s += 45;
  if (local.googleLink) s += 25;
  return Math.min(100, s);
}

// Google Places : note + volume d'avis d'une fiche. Dormant sans PLACES_API_KEY.
export async function runPlaces(env, query) {
  if (!env || !env.PLACES_API_KEY || !query) return null;
  try {
    const find = "https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=" + encodeURIComponent(query) + "&inputtype=textquery&fields=place_id&key=" + env.PLACES_API_KEY;
    const j1 = await (await fetchWithTimeout(find, 8000)).json();
    const cand = j1 && j1.candidates && j1.candidates[0];
    if (!cand || !cand.place_id) return { found: false };
    const det = "https://maps.googleapis.com/maps/api/place/details/json?place_id=" + encodeURIComponent(cand.place_id) + "&fields=name,rating,user_ratings_total,website,url&key=" + env.PLACES_API_KEY;
    const jd = await (await fetchWithTimeout(det, 8000)).json();
    const res = jd && jd.result;
    if (!res) return { found: false };
    return { found: true, name: res.name || "", rating: res.rating != null ? res.rating : null, reviews: res.user_ratings_total != null ? res.user_ratings_total : null, hasSite: !!res.website, website: res.website || "", mapUrl: res.url || "" };
  } catch (_) { return { found: false }; }
}

// Google Places Text Search : filet large (renvoie plusieurs résultats avec place_id).
// Bien plus robuste que findplacefromtext pour les activités « zone de service »
// (indépendants sans adresse publique) que la recherche exacte ne fait pas remonter.
export async function placesTextSearch(env, query) {
  if (!env || !env.PLACES_API_KEY || !query) return [];
  try {
    const u = "https://maps.googleapis.com/maps/api/place/textsearch/json?query=" + encodeURIComponent(query) + "&region=fr&language=fr&key=" + env.PLACES_API_KEY;
    const j = await (await fetchWithTimeout(u, 8000)).json();
    const results = (j && j.results) || [];
    return results.map(function (r) {
      return { place_id: r.place_id || "", name: r.name || "", rating: r.rating != null ? r.rating : null, reviews: r.user_ratings_total != null ? r.user_ratings_total : null };
    });
  } catch (_) { return []; }
}

// Variante brute (diagnostic) : renvoie le statut de l'API + les résultats bruts.
export async function placesTextSearchRaw(env, query) {
  if (!env || !env.PLACES_API_KEY || !query) return { status: "NO_KEY_OR_QUERY", results: [] };
  try {
    const u = "https://maps.googleapis.com/maps/api/place/textsearch/json?query=" + encodeURIComponent(query) + "&region=fr&language=fr&key=" + env.PLACES_API_KEY;
    const j = await (await fetchWithTimeout(u, 8000)).json();
    return {
      status: (j && j.status) || "NO_STATUS",
      error: (j && j.error_message) || "",
      results: ((j && j.results) || []).slice(0, 8).map(function (r) {
        return { place_id: r.place_id || "", name: r.name || "", addr: r.formatted_address || "", rating: r.rating != null ? r.rating : null, reviews: r.user_ratings_total != null ? r.user_ratings_total : null };
      }),
    };
  } catch (e) { return { status: "EXCEPTION", error: String(e), results: [] }; }
}

// Recherche par NUMÉRO DE TÉLÉPHONE : lookup exact, fiable même pour les
// activités « zone de service » (adresse masquée) que la recherche par nom rate.
export async function placesFindByPhone(env, phone) {
  if (!env || !env.PLACES_API_KEY || !phone) return { status: "NO_KEY_OR_PHONE", candidates: [] };
  try {
    const u = "https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=" + encodeURIComponent(phone) + "&inputtype=phonenumber&fields=place_id,name,rating,user_ratings_total&language=fr&key=" + env.PLACES_API_KEY;
    const j = await (await fetchWithTimeout(u, 8000)).json();
    return { status: (j && j.status) || "NO_STATUS", error: (j && j.error_message) || "", candidates: (j && j.candidates) || [] };
  } catch (e) { return { status: "EXCEPTION", error: String(e), candidates: [] }; }
}

// Détails d'une fiche à partir d'un place_id connu (voie la plus fiable et la moins coûteuse).
export async function placeDetails(env, placeId) {
  if (!env || !env.PLACES_API_KEY || !placeId) return null;
  try {
    const det = "https://maps.googleapis.com/maps/api/place/details/json?place_id=" + encodeURIComponent(placeId) + "&fields=name,rating,user_ratings_total,website,url&language=fr&key=" + env.PLACES_API_KEY;
    const jd = await (await fetchWithTimeout(det, 8000)).json();
    const res = jd && jd.result;
    if (!res) return null;
    return { found: true, name: res.name || "", rating: res.rating != null ? res.rating : null, reviews: res.user_ratings_total != null ? res.user_ratings_total : null, hasSite: !!res.website, website: res.website || "", mapUrl: res.url || "" };
  } catch (_) { return null; }
}

// Devine le secteur d'après le contenu (regroupement du benchmark).
function guessSector(title, html) {
  const m = ((title || "") + " " + (html || "").replace(/<[^>]+>/g, " ")).toLowerCase().slice(0, 5000);
  const map = [
    ["restaurant", ["restaur", "bar à vin", "brasserie", "pizz", "traiteur", "bistro", "trattoria", "cuisine", "gastronom"]],
    ["artisan", ["plomb", "électrici", "electrici", "chauffagi", "maçon", "menuis", "couvreur", "peintre en b", "serrur", "carreleur", "artisan", "rénovation", "btp", "terrasse"]],
    ["commerce", ["boutique", "magasin", "fleuriste", "bijout", "prêt-à-porter", "épicerie", "concept store", "décoration", "cave à"]],
    ["bien-etre", ["coiff", "esthé", "esthe", "barbier", "massage", " spa", "onglerie", "institut de b", "sophro", "naturo", "yoga", "bien-être", "pilates"]],
    ["sante", ["dentiste", "chirurgien", "médecin", "medecin", "kiné", "ostéo", "osteo", "podologue", "infirmi", "orthop", "thérapeute", "psycholog", "opticien"]],
    ["immobilier", ["immobili", "agence immo", "syndic", "gestion locative", "achat vente"]],
    ["services", ["avocat", "notaire", "comptable", "assurance", "coach", "auto-école", "auto ecole", "garage", "automobile", "photograph", "agence web", "conseil"]],
  ];
  for (const it of map) { if (it[1].some(function (w) { return m.indexOf(w) > -1; })) return it[0]; }
  return "autre";
}

// Projection réaliste : score atteignable en corrigeant les priorités (70% du potentiel).
function computeProjection(overall, pillars) {
  const targets = { site: 82, google: 80, social: 75, reviews: 70 };
  const W = { site: 0.4, google: 0.25, social: 0.2, reviews: 0.15 };
  let gain = 0;
  for (const k in pillars) { const cur = pillars[k].score, tgt = targets[k] || 80; if (cur < tgt) gain += (tgt - cur) * (W[k] || 0) * 0.7; }
  return Math.min(95, Math.max(overall + 2, Math.round(overall + gain)));
}

/* ---------- Benchmark sectoriel réel + ré-audit (D1) ---------- */
const SECTOR_SEED = { restaurant: 61, artisan: 55, commerce: 60, "bien-etre": 62, sante: 66, immobilier: 64, services: 63, autre: 60 };
async function ensureAuditSchema(env) {
  if (!env || !env.DB) return;
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS audits (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL DEFAULT (datetime('now')), url TEXT, host TEXT, sector TEXT, score INTEGER, resultats_json TEXT, ip_hash TEXT)").run();
  try { await env.DB.prepare("ALTER TABLE audits ADD COLUMN host TEXT").run(); } catch (_) {}
  try { await env.DB.prepare("ALTER TABLE audits ADD COLUMN sector TEXT").run(); } catch (_) {}
}
async function sectorAvg(env, sector) {
  if (!env || !env.DB) return { a: null, c: 0 };
  try {
    const r = await env.DB.prepare("SELECT AVG(score) a, COUNT(*) c FROM audits WHERE sector=?").bind(sector).all();
    const row = r && r.results && r.results[0];
    return { a: row ? row.a : null, c: row ? Number(row.c) : 0 };
  } catch (_) { return { a: null, c: 0 }; }
}
function blendBenchmark(sector, agg, overall) {
  const seed = SECTOR_SEED[sector] != null ? SECTOR_SEED[sector] : 60;
  let standard = seed;
  if (agg && agg.c) standard = Math.round((seed * 8 + agg.a * agg.c) / (8 + agg.c));
  return { site: overall, standard: standard, fl: 96, sector: sector, sample: agg ? agg.c : 0 };
}
async function prevAudit(env, url) {
  if (!env || !env.DB) return null;
  try {
    const r = await env.DB.prepare("SELECT score, created_at FROM audits WHERE url=? ORDER BY datetime(created_at) DESC LIMIT 1").bind(url).all();
    const row = r && r.results && r.results[0];
    return row ? { score: row.score, date: row.created_at } : null;
  } catch (_) { return null; }
}
async function storeAudit(env, rec) {
  if (!env || !env.DB) return;
  for (let a = 0; a < 2; a++) {
    try {
      await env.DB.prepare("INSERT INTO audits (created_at,url,host,sector,score,resultats_json,ip_hash) VALUES (?,?,?,?,?,?,?)")
        .bind(rec.ts, rec.url, rec.host, rec.sector, rec.overall, JSON.stringify(rec.summary).slice(0, 20000), "").run();
      return;
    } catch (_) { if (a === 0) { try { await ensureAuditSchema(env); } catch (_e) {} } }
  }
}

/** Agrégats anonymisés pour le Baromètre de la présence en ligne (Chantier 3).
 *  Ne renvoie que des moyennes/compteurs — jamais d'URL ni de donnée nominative. */
export async function barometreStats(env) {
  const SECTOR_LBL = { restaurant: "Restauration", artisan: "Artisanat & BTP", commerce: "Commerce", "bien-etre": "Beauté & bien-être", sante: "Santé", immobilier: "Immobilier", services: "Services", autre: "Autres" };
  const out = { total: 0, avg: null, sectors: [], pillars: null, distrib: null, seeds: SECTOR_SEED };
  if (!env || !env.DB) return out;
  // Exclut les domaines de test/démo pour ne compter que de vrais établissements.
  const W = " WHERE host NOT IN ('example.com','www.example.com','example.org','example.net','localhost','127.0.0.1') ";
  try { await ensureAuditSchema(env); } catch (_) {}
  try {
    const g = (await env.DB.prepare("SELECT COUNT(*) c, AVG(score) a FROM audits" + W).all()).results[0];
    out.total = g ? Number(g.c) : 0;
    out.avg = g && g.a != null ? Math.round(g.a) : null;
    const s = (await env.DB.prepare("SELECT sector, COUNT(*) c, AVG(score) a FROM audits" + W + "GROUP BY sector ORDER BY c DESC").all()).results || [];
    out.sectors = s.map(function (r) { return { key: r.sector, label: SECTOR_LBL[r.sector] || r.sector, count: Number(r.c), avg: Math.round(r.a) }; });
    const p = (await env.DB.prepare("SELECT AVG(json_extract(resultats_json,'$.site')) si, AVG(json_extract(resultats_json,'$.google')) go, AVG(json_extract(resultats_json,'$.social')) so, AVG(json_extract(resultats_json,'$.reviews')) re FROM audits" + W).all()).results[0];
    if (p && p.si != null) out.pillars = { site: Math.round(p.si), google: Math.round(p.go), social: Math.round(p.so), reviews: Math.round(p.re) };
    const d = (await env.DB.prepare("SELECT SUM(CASE WHEN score<50 THEN 1 ELSE 0 END) low, SUM(CASE WHEN score>=50 AND score<80 THEN 1 ELSE 0 END) mid, SUM(CASE WHEN score>=80 THEN 1 ELSE 0 END) high FROM audits" + W).all()).results[0];
    if (d) out.distrib = { low: Number(d.low || 0), mid: Number(d.mid || 0), high: Number(d.high || 0) };
  } catch (_) {}
  return out;
}

async function fetchWithTimeout(url, ms, opts) {
  const ctrl = new AbortController(); const t = setTimeout(function () { ctrl.abort(); }, ms);
  try { return await fetch(url, Object.assign({ signal: ctrl.signal, redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (compatible; FL-Audit/1.0; +https://francoisleterrier.fr)" } }, opts || {})); }
  finally { clearTimeout(t); }
}

/** PageSpeed Insights (mobile). Avec clé = fiable ; sans clé = tentative
 *  best-effort (quota anonyme, souvent limité). Null si indisponible/erreur. */
async function runPSI(env, url) {
  try {
    const key = env && env.PAGESPEED_API_KEY ? "&key=" + env.PAGESPEED_API_KEY : "";
    const api = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed?strategy=mobile&category=performance&category=seo&category=accessibility&category=best-practices&url=" + encodeURIComponent(url) + key;
    const r = await fetchWithTimeout(api, 18000);
    if (!r.ok) return null;
    const j = await r.json();
    const cat = j.lighthouseResult && j.lighthouseResult.categories;
    if (!cat) return null;
    const pc = function (k) { return cat[k] && cat[k].score != null ? Math.round(cat[k].score * 100) : null; };
    const audits = j.lighthouseResult.audits || {};
    return {
      perf: pc("performance"), seo: pc("seo"), a11y: pc("accessibility"), bp: pc("best-practices"),
      lcp: audits["largest-contentful-paint"] && audits["largest-contentful-paint"].displayValue,
      cls: audits["cumulative-layout-shift"] && audits["cumulative-layout-shift"].displayValue,
    };
  } catch (_) { return null; }
}

async function existsPath(origin, path) {
  try { const r = await fetchWithTimeout(origin + path, 6000, { method: "GET" }); return r.ok; } catch (_) { return false; }
}

/** Plan d'action IA (3 priorités persuasives, orientées bénéfice). */
async function aiPlan(env, ctx) {
  const fails = ctx.checks.filter(function (c) { return !c.ok; }).map(function (c) { return c.label + (c.detail ? " (" + c.detail + ")" : ""); });
  const pil = ctx.pillars || {};
  const pilTxt = Object.keys(pil).map(function (k) { return pil[k].label + " " + pil[k].score + "/100"; }).join(", ");
  const msgs = [
    { role: "system", content: "Tu es un consultant en présence en ligne français d'élite qui parle aux dirigeants de TPE en langage clair et orienté résultat (clients, chiffre d'affaires), jamais jargon. Tu réponds STRICTEMENT en JSON valide." },
    { role: "user", content: "Audit de présence en ligne de " + ctx.host + ". Score global : " + ctx.overall + "/100" + (ctx.projection ? " (atteignable ~" + ctx.projection + "/100 en corrigeant l'essentiel)" : "") + ". Piliers : " + (pilTxt || "n/d") + ". Points faibles du site : " + (fails.length ? fails.join(" ; ") : "peu de faiblesses") + ". Signal local (fiche Google/coordonnées) : " + ctx.local.score + "/4. Rédige les 3 priorités LES PLUS RENTABLES, en visant d'abord les piliers les plus faibles. Format JSON : {\"priorities\":[{\"title\":\"titre court\",\"why\":\"ce que ça coûte en clients aujourd'hui, 1 phrase\",\"action\":\"quoi faire concrètement, 1 phrase\"}]} (exactement 3, en français, persuasif mais honnête)." },
  ];
  const j = await aiJSON(env, msgs, 700);
  if (j && Array.isArray(j.priorities) && j.priorities.length) return j.priorities.slice(0, 3);
  // repli si l'IA échoue
  return fails.slice(0, 3).map(function (f) { return { title: "Corriger : " + f, why: "Ce point pénalise votre visibilité et la confiance des visiteurs.", action: "À optimiser en priorité." }; });
}

/**
 * Vue PUBLIQUE (aspirateur à leads) : montre le score, les problèmes (sans le
 * détail), et les priorités avec le "pourquoi ça coûte" — mais PAS la solution
 * concrète (action), qui reste notre valeur, révélée lors du diagnostic.
 */
export function publicView(full, id) {
  const weak = full.checks.filter(function (c) { return !c.ok; });
  const strong = full.checks.filter(function (c) { return c.ok; });
  const p = full.pillars || {};
  return {
    ok: true, url: full.url, host: full.host, overall: full.overall, projection: full.projection,
    screenshot: full.screenshot, scores: full.scores,
    pillars: {
      site: p.site ? p.site.score : null,
      google: p.google ? p.google.score : null,
      social: p.social ? p.social.score : null,
      reviews: p.reviews ? p.reviews.score : null,
    },
    social: full.social ? { platforms: full.social.platforms, count: full.social.count } : null,
    places: full.places || null,
    sector: full.sector,
    summary: { strong: strong.length, weak: weak.length, total: full.checks.length },
    issues: weak.slice(0, 3).map(function (c) { return c.label; }), // problèmes teasés, sans le "comment"
    issuesHidden: Math.max(0, weak.length - 3),
    localScore: full.local ? full.local.score : 0,
    priorities: (full.plan || []).map(function (p2) { return { title: p2.title, why: p2.why }; }), // action retirée
    benchmark: full.benchmark,
    previous: full.previous || null,
    auditId: id,
  };
}

export async function runAudit(env, input) {
  const raw = typeof input === "string" ? { url: input } : (input || {});
  const norm = normalizeUrl(raw.url);
  if (norm.error) return { ok: false, error: norm.error };
  const url = norm.url;
  const nom = String(raw.nom || "").slice(0, 80).trim();
  const ville = String(raw.ville || "").slice(0, 80).trim();

  let res;
  try { res = await fetchWithTimeout(url, 9000); }
  catch (e) { return { ok: false, error: "Site injoignable", reachable: false, url: url }; }
  if (!res.ok) return { ok: false, error: "Le site a répondu " + res.status, reachable: false, url: url, status: res.status };
  let html = "";
  try { html = await res.text(); } catch (_) {}
  if (html.length > 900000) html = html.slice(0, 900000);

  const seo = parseSeo(url, html, res.headers);
  const local = localSignal(html);
  const social = detectSocial(html);
  const sector = guessSector(seo.title, html);

  // Pilier Site = score on-page pondéré (robots/sitemap inclus).
  const [hasRobots, hasSitemap] = await Promise.all([
    existsPath(norm.origin, "/robots.txt"),
    existsPath(norm.origin, "/sitemap.xml"),
  ]);
  seo.checks.push({ id: "robots", label: "Fichier robots.txt", ok: hasRobots, w: 3, detail: "" });
  seo.checks.push({ id: "sitemap", label: "Sitemap.xml", ok: hasSitemap, w: 4, detail: "" });
  const totalW = seo.checks.reduce(function (a, c) { return a + c.w; }, 0);
  const gotW = seo.checks.reduce(function (a, c) { return a + (c.ok ? c.w : 0); }, 0);
  const siteScore = Math.round((gotW / totalW) * 100);

  // Données réelles en parallèle : Lighthouse, fiche Google (Places, dormant),
  // moyenne secteur, audit précédent (ré-audit). On tient le budget de temps.
  // Places n'est appelé QUE si l'utilisateur donne nom/ville (économise le
  // crédit Google : un audit sans ces champs n'interroge pas Places).
  const placesQuery = (nom || ville) ? (nom + " " + ville).trim() : "";
  const [psi, places, agg, previous] = await Promise.all([
    runPSI(env, url),
    runPlaces(env, placesQuery),
    sectorAvg(env, sector),
    prevAudit(env, url),
  ]);

  const pillars = {
    site: { label: "Site web", score: siteScore, checks: seo.checks },
    google: { label: "Fiche Google", score: googlePillar(local, places) },
    social: { label: "Réseaux sociaux", score: social.score, platforms: social.platforms },
    reviews: { label: "Avis & réputation", score: reviewsPillar(html, local, places) },
  };
  const W = { site: 0.4, google: 0.25, social: 0.2, reviews: 0.15 };
  const overall = Math.round(pillars.site.score * W.site + pillars.google.score * W.google + pillars.social.score * W.social + pillars.reviews.score * W.reviews);
  const projection = computeProjection(overall, pillars);
  const benchmark = blendBenchmark(sector, agg, overall);

  const plan = await aiPlan(env, { host: norm.host, checks: seo.checks, overall: overall, local: local, psi: psi, pillars: pillars, projection: projection });
  const shot = "https://s.wordpress.com/mshots/v1/" + encodeURIComponent(url) + "?w=1200";
  const ts = new Date().toISOString();

  // Stockage (benchmark + ré-audit). Non bloquant : un échec D1 ne casse rien.
  try { await storeAudit(env, { ts: ts, url: url, host: norm.host, sector: sector, overall: overall, summary: { site: pillars.site.score, google: pillars.google.score, social: pillars.social.score, reviews: pillars.reviews.score } }); } catch (_) {}

  return {
    ok: true, url: url, host: norm.host, reachable: true,
    overall: overall, projection: projection, sector: sector,
    scores: psi || null,
    pillars: pillars,
    social: social,
    places: places && places.found ? { rating: places.rating, reviews: places.reviews } : null,
    seo: { title: seo.title, desc: seo.desc, h1: seo.h1, words: seo.words, ldTypes: seo.ldTypes, imgs: seo.imgs },
    checks: seo.checks,
    local: local,
    plan: plan,
    screenshot: shot,
    benchmark: benchmark,
    previous: previous,
  };
}
