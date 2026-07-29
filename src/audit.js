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

async function fetchWithTimeout(url, ms, opts) {
  const ctrl = new AbortController(); const t = setTimeout(function () { ctrl.abort(); }, ms);
  try { return await fetch(url, Object.assign({ signal: ctrl.signal, redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (compatible; FL-Audit/1.0; +https://francoisleterrier.fr)" } }, opts || {})); }
  finally { clearTimeout(t); }
}

/** PageSpeed Insights (mobile). Null si pas de clé ou erreur. */
async function runPSI(env, url) {
  if (!env || !env.PAGESPEED_API_KEY) return null;
  try {
    const api = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed?strategy=mobile&category=performance&category=seo&category=accessibility&category=best-practices&url=" + encodeURIComponent(url) + "&key=" + env.PAGESPEED_API_KEY;
    const r = await fetchWithTimeout(api, 28000);
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
  const msgs = [
    { role: "system", content: "Tu es un consultant web français d'élite qui parle aux dirigeants de TPE en langage clair et orienté résultat (clients, chiffre d'affaires), jamais jargon. Tu réponds STRICTEMENT en JSON valide." },
    { role: "user", content: "Voici l'audit d'un site (" + ctx.host + "). Points faibles détectés : " + (fails.length ? fails.join(" ; ") : "peu de faiblesses") + ". Score global : " + ctx.overall + "/100. Signal local (fiche Google/coordonnées) : " + ctx.local.score + "/4." + (ctx.psi ? " Performance mobile : " + ctx.psi.perf + "/100." : "") + " Rédige les 3 priorités les plus rentables, format JSON : {\"priorities\":[{\"title\":\"titre court\",\"why\":\"ce que ça coûte en clients aujourd'hui, 1 phrase\",\"action\":\"quoi faire concrètement, 1 phrase\"}]} (exactement 3, en français, persuasif mais honnête)." },
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
  return {
    ok: true, url: full.url, host: full.host, overall: full.overall,
    screenshot: full.screenshot, scores: full.scores,
    summary: { strong: strong.length, weak: weak.length, total: full.checks.length },
    issues: weak.slice(0, 3).map(function (c) { return c.label; }), // problèmes teasés, sans le "comment"
    issuesHidden: Math.max(0, weak.length - 3),
    localScore: full.local ? full.local.score : 0,
    priorities: (full.plan || []).map(function (p) { return { title: p.title, why: p.why }; }), // action retirée
    benchmark: full.benchmark,
    auditId: id,
  };
}

export async function runAudit(env, input) {
  const norm = normalizeUrl(input);
  if (norm.error) return { ok: false, error: norm.error };
  const url = norm.url;

  let res;
  try { res = await fetchWithTimeout(url, 9000); }
  catch (e) { return { ok: false, error: "Site injoignable", reachable: false, url: url }; }
  if (!res.ok) return { ok: false, error: "Le site a répondu " + res.status, reachable: false, url: url, status: res.status };
  let html = "";
  try { html = await res.text(); } catch (_) {}
  if (html.length > 900000) html = html.slice(0, 900000);

  const seo = parseSeo(url, html, res.headers);
  const local = localSignal(html);
  const totalW = seo.checks.reduce(function (a, c) { return a + c.w; }, 0);
  const gotW = seo.checks.reduce(function (a, c) { return a + (c.ok ? c.w : 0); }, 0);
  const overall = Math.round((gotW / totalW) * 100);

  const [psi, hasRobots, hasSitemap] = await Promise.all([
    runPSI(env, url),
    existsPath(norm.origin, "/robots.txt"),
    existsPath(norm.origin, "/sitemap.xml"),
  ]);
  seo.checks.push({ id: "robots", label: "Fichier robots.txt", ok: hasRobots, w: 3, detail: "" });
  seo.checks.push({ id: "sitemap", label: "Sitemap.xml", ok: hasSitemap, w: 4, detail: "" });

  const plan = await aiPlan(env, { host: norm.host, checks: seo.checks, overall: overall, local: local, psi: psi });
  const shot = "https://s.wordpress.com/mshots/v1/" + encodeURIComponent(url) + "?w=1200";

  return {
    ok: true, url: url, host: norm.host, reachable: true,
    overall: overall,
    scores: psi || null,
    seo: { title: seo.title, desc: seo.desc, h1: seo.h1, words: seo.words, ldTypes: seo.ldTypes, imgs: seo.imgs },
    checks: seo.checks,
    local: local,
    plan: plan,
    screenshot: shot,
    benchmark: { site: overall, standard: 62, fl: 96 },
  };
}
