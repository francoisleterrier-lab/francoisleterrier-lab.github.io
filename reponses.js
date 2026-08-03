/* =====================================================================
   FL — Moteur de réponses local. Récupération côté client sur le corpus
   (blog-kb.json), puis réponse ancrée via /ask-article (Worker AI), avec
   citation des articles sources. Aucune dépendance.
   ===================================================================== */
(function () {
  "use strict";
  var API = "https://main.francois-leterrier-cmw.workers.dev";
  var input = document.getElementById("rep-q");
  var goBtn = document.getElementById("rep-go");
  var out = document.getElementById("rep-out");
  if (!input || !out) return;
  var KB = [];
  var KBP = fetch("/blog-kb.json").then(function (r) { return r.json(); }).then(function (d) { KB = (d && d.items) || []; return KB; }).catch(function () { return []; });

  var STOP = {};
  ("le la les un une des du de d au aux et ou où a à en dans sur pour par avec sans que qui quoi quel quelle quels quelles est sont ce cet cette ces mon ma mes votre vos son sa ses il elle on nous vous ils elles je tu se ne pas plus moins comment pourquoi combien quand faut faire m"
    + "mais donc car y si tout tous toute toutes bien plus être avoir peut").split(" ").forEach(function (w) { STOP[w] = 1; });

  function toks(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(function (w) { return w.length > 2 && !STOP[w]; });
  }
  function retrieve(q, items) {
    var qt = toks(q); if (!qt.length || !items.length) return items.slice(0, 3);
    var scored = items.map(function (it) {
      var tset = {}; toks(it.title).forEach(function (w) { tset[w] = 1; });
      var bmap = {}; toks(it.text).forEach(function (w) { bmap[w] = (bmap[w] || 0) + 1; });
      var s = 0;
      qt.forEach(function (w) { if (tset[w]) s += 4; if (bmap[w]) s += Math.min(3, bmap[w]); });
      return { it: it, s: s };
    }).sort(function (a, b) { return b.s - a.s; });
    var top = scored.filter(function (x) { return x.s > 0; }).slice(0, 3).map(function (x) { return x.it; });
    return top.length ? top : items.slice(0, 3);
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  var busy = false;
  function ask(q) {
    q = (q || "").trim(); if (!q || busy) return;
    busy = true; if (goBtn) goBtn.disabled = true;
    out.innerHTML = '<div class="rep-card rep-load"><span class="rep-dot"></span><span class="rep-dot"></span><span class="rep-dot"></span> L\'IA lit mes guides…</div>';
    out.scrollIntoView({ behavior: "smooth", block: "nearest" });
    KBP.then(function (items) {
      var picked = retrieve(q, items);
      var ctx = picked.map(function (it, i) { return "[" + (i + 1) + "] " + it.title + "\n" + it.text; }).join("\n\n").slice(0, 5600);
      return fetch(API + "/ask-article", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: q, context: ctx, slug: "reponses" })
      }).then(function (r) { return r.json(); }).then(function (d) { render(q, d && d.reply, picked); });
    }).catch(function () {
      out.innerHTML = '<div class="rep-card">Connexion momentanément indisponible. Réessayez, ou <a href="/contact.html">écrivez à François</a>.</div>';
    }).then(function () { busy = false; if (goBtn) goBtn.disabled = false; });
  }

  function render(q, ans, sources) {
    var srcHtml = (sources || []).map(function (s) {
      return '<a class="rep-src" href="' + esc(s.url) + '">' + (s.tag ? '<span class="rep-tag">' + esc(s.tag) + '</span>' : '') + '<span class="rep-st">' + esc(s.title) + '</span></a>';
    }).join("");
    var fu = ["Et pour mon métier précis ?", "Par quoi je commence ?", "Combien ça coûte ?"];
    var fuHtml = fu.map(function (f) { return '<button class="rep-chip" type="button">' + esc(f) + '</button>'; }).join("");
    out.innerHTML =
      '<div class="rep-card rep-answer">'
      + '<div class="rep-q">' + esc(q) + '</div>'
      + '<div class="rep-a">' + esc(ans || "Je n'ai pas trouvé la réponse dans mes guides. Pour un conseil personnalisé, parlons-en directement.").replace(/\n/g, "<br>") + '</div>'
      + (srcHtml ? '<div class="rep-srch">📚 Sources — mes guides&nbsp;:</div><div class="rep-srcs">' + srcHtml + '</div>' : '')
      + '<div class="rep-follow"><span class="rep-fl">Continuer&nbsp;:</span>' + fuHtml + '</div>'
      + '<div class="rep-cta">Besoin d\'un avis sur VOTRE situation&nbsp;? <a href="/audit.html">Audit gratuit</a> · <a href="/contact.html">Parler à François</a></div>'
      + '<div class="rep-note">Réponse générée par IA à partir de mes articles. Je ne garde aucune donnée&nbsp;; pour du sur-mesure, contactez-moi.</div>'
      + '</div>';
    [].forEach.call(out.querySelectorAll(".rep-chip"), function (c) {
      c.addEventListener("click", function () { input.value = c.textContent; ask(input.value); });
    });
  }

  if (goBtn) goBtn.addEventListener("click", function () { ask(input.value); });
  input.addEventListener("keydown", function (e) { if (e.key === "Enter") ask(input.value); });
  [].forEach.call(document.querySelectorAll("[data-rep-ex]"), function (b) {
    b.addEventListener("click", function () { input.value = b.getAttribute("data-rep-ex"); ask(input.value); });
  });
  // pré-remplissage via ?q=
  try {
    var qp = new URLSearchParams(location.search).get("q");
    if (qp) { input.value = qp; ask(qp); }
  } catch (_) {}
})();
