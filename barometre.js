/* =====================================================================
   FL — Baromètre de la présence en ligne (Chantier 3).
   Lit les agrégats anonymisés du Worker (/barometre) et les affiche.
   Données réelles issues des audits ; cadrage honnête quand l'échantillon
   est encore petit (le baromètre s'enrichit à chaque audit).
   ===================================================================== */
(function () {
  "use strict";
  var API = "https://main.francois-leterrier-cmw.workers.dev";
  function $(s) { return document.querySelector(s); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function col(n) { return n >= 80 ? "#37d67a" : n >= 50 ? "#f0a04b" : "#ff6b6b"; }
  var PILL = { site: "Site web", google: "Fiche Google", social: "Réseaux sociaux", reviews: "Avis & réputation" };
  var SECT = { restaurant: "Restauration", artisan: "Artisanat & BTP", commerce: "Commerce", "bien-etre": "Beauté & bien-être", sante: "Santé", immobilier: "Immobilier", services: "Services", autre: "Autres" };

  function bar(label, sub, v, c) {
    var track = "display:block;height:13px;border-radius:8px;background:rgba(255,255,255,.07);overflow:hidden";
    var fill = "display:block;height:100%;width:" + v + "%;border-radius:8px;background:" + c;
    return '<div class="brow"><span class="bl">' + esc(label) + (sub ? "<small>" + esc(sub) + "</small>" : "") + '</span><span class="btrack" style="' + track + '"><span class="bfill" style="' + fill + '"></span></span><b>' + v + "</b></div>";
  }

  function ready(fn) { document.readyState !== "loading" ? fn() : document.addEventListener("DOMContentLoaded", fn); }
  ready(function () {
    fetch(API + "/barometre").then(function (r) { return r.json(); }).then(render).catch(function () { render(null); });

    function render(data) {
      var st = (data && data.stats) || {};
      var seeds = st.seeds || { restaurant: 61, artisan: 55, commerce: 60, "bien-etre": 62, sante: 66, immobilier: 64, services: 63, autre: 60 };
      var total = st.total || 0;
      var seedVals = Object.keys(seeds).map(function (k) { return seeds[k]; });
      var seedAvg = Math.round(seedVals.reduce(function (a, b) { return a + b; }, 0) / seedVals.length);
      var avg = st.avg != null ? st.avg : seedAvg;

      // Cartes
      var d = st.distrib || { low: 0, mid: 0, high: 0 };
      var pct = function (x) { return total > 0 ? Math.round((x / total) * 100) : null; };
      var cLow = pct(d.low), cHigh = pct(d.high);
      $("#baro-cards").innerHTML =
        '<div class="bcard"><div class="n grad">' + avg + '</div><div class="l">Score moyen de présence en ligne /100</div></div>' +
        '<div class="bcard"><div class="n">' + total + '</div><div class="l">présence' + (total > 1 ? "s" : "") + ' analysée' + (total > 1 ? "s" : "") + '</div></div>' +
        '<div class="bcard"><div class="n" style="color:#ff6b6b">' + (cLow != null ? cLow + "%" : "—") + '</div><div class="l">en difficulté (score &lt; 50)</div></div>' +
        '<div class="bcard"><div class="n" style="color:#37d67a">' + (cHigh != null ? cHigh + "%" : "—") + '</div><div class="l">bien visibles (score ≥ 80)</div></div>';

      var note = $("#baro-note");
      if (total < 8) {
        note.hidden = false;
        note.innerHTML = "📈 <b>Baromètre en construction</b> : " + total + " analyse" + (total > 1 ? "s" : "") + " à ce jour. Les repères ci-dessous sont nos <b>seuils de référence par secteur</b> ; ils sont progressivement remplacés par les chiffres réels, mesurés à chaque audit.";
      } else { note.hidden = true; }

      // Piliers (maillon faible)
      var pw = $("#baro-pillars");
      if (st.pillars) {
        var keys = ["site", "google", "social", "reviews"];
        var minK = keys[0];
        keys.forEach(function (k) { if (st.pillars[k] < st.pillars[minK]) minK = k; });
        pw.innerHTML = keys.map(function (k) { return bar(PILL[k], "", st.pillars[k], col(st.pillars[k])); }).join("") +
          '<div class="weak">🔎 Le point faible n°1 des professionnels analysés : <b>' + esc(PILL[minK]) + "</b> (" + st.pillars[minK] + "/100 en moyenne). C'est là qu'un accompagnement rapporte le plus de clients.</div>";
      } else {
        pw.innerHTML = '<p class="sub" style="margin:0">Les moyennes par pilier s\'afficheront dès les premières analyses. En général, ce sont les <b>réseaux sociaux</b> et la <b>fiche Google</b> qui pèchent le plus chez les TPE.</p>';
      }

      // Secteurs
      var sw = $("#baro-sectors");
      var rows;
      if (st.sectors && st.sectors.length) {
        rows = st.sectors.map(function (s) { return bar(s.label || SECT[s.key] || s.key, s.count + " analyse" + (s.count > 1 ? "s" : ""), s.avg, col(s.avg)); }).join("");
      } else {
        rows = Object.keys(seeds).map(function (k) { return bar(SECT[k] || k, "seuil de référence", seeds[k], col(seeds[k])); }).join("");
      }
      sw.innerHTML = rows;

      // Date de mise à jour
      if (data && data.generated) {
        try { var dt = new Date(data.generated); $("#baro-upd").textContent = "Mis à jour le " + dt.toLocaleDateString("fr-FR") + " · s'actualise à chaque audit."; } catch (_) {}
      }
    }
  });
})();
