/* =====================================================================
   FL — Audit instantané (Chantier 2), front.
   Affiche la vue PUBLIQUE (aspirateur à leads) : score + problèmes teasés
   + priorités SANS la solution (verrouillée) + capture e-mail → /lead.
   Le rapport complet part chez François (lead).
   ===================================================================== */
(function () {
  "use strict";
  var API = "https://main.francois-leterrier-cmw.workers.dev";
  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function col(n) { return n >= 80 ? "#37d67a" : n >= 50 ? "#f0a04b" : "#ff6b6b"; }
  function ready(fn) { document.readyState !== "loading" ? fn() : document.addEventListener("DOMContentLoaded", fn); }

  function gauge(n, label) {
    return '<div class="gauge" style="--v:' + n + ';--c:' + col(n) + '"><div class="in"><div class="n" style="color:' + col(n) + '">' + n + '</div><div class="s">' + esc(label) + "</div></div></div>";
  }
  function mini(n, label) {
    if (n == null) return "";
    return '<div class="mini"><div class="mn" style="color:' + col(n) + '">' + n + '</div><div class="ml">' + esc(label) + "</div></div>";
  }
  function verdict(n) {
    if (n >= 80) return "Bonne présence en ligne, mais il reste des gains à aller chercher.";
    if (n >= 55) return "Des bases correctes… et plusieurs points qui vous coûtent des clients.";
    return "Votre présence en ligne laisse passer des clients. La bonne nouvelle : c'est corrigeable.";
  }
  // Petite jauge de pilier (Site / Fiche Google / Réseaux / Avis).
  function pgauge(n, label, sub) {
    if (n == null) n = 0;
    return '<div class="pcard"><div class="pgauge" style="--v:' + n + ';--c:' + col(n) + '"><span>' + n + '</span></div><div class="pl">' + esc(label) + '</div><div class="ps">' + esc(sub || "") + "</div></div>";
  }
  var SECTORLBL = { restaurant: "restaurants", artisan: "artisans", commerce: "commerces", "bien-etre": "bien-être & beauté", sante: "santé", immobilier: "immobilier", services: "services", autre: "votre secteur" };

  // mShots (s.wordpress.com) génère la capture en asynchrone : la 1re requête
  // renvoie un placeholder ~400px ("Generating Preview…"), puis la vraie capture
  // (?w=1200 → ~1200px) sur les requêtes suivantes. On sonde donc la MÊME URL
  // jusqu'à obtenir une image large — surtout PAS de cache-buster, sinon mShots
  // relancerait une génération à chaque essai et ne convergerait jamais.
  function pollShot(url) {
    var img = document.getElementById("au-shot"), skel = document.getElementById("au-shot-skel");
    if (!img || !url) { if (skel && skel.remove) skel.remove(); return; }
    var tries = 0, MAX = 14;
    function reveal(src) { img.src = src; requestAnimationFrame(function () { img.classList.add("ready"); }); if (skel && skel.remove) skel.remove(); }
    function giveUp() { if (skel) skel.innerHTML = '<span style="font-size:26px">🖥️</span><span>Aperçu momentanément indisponible — il figurera dans votre diagnostic.</span>'; }
    function attempt() {
      tries++;
      var probe = new Image();
      probe.onload = function () {
        if (probe.naturalWidth >= 600) reveal(probe.src);
        else if (tries < MAX) setTimeout(attempt, 2200);
        else giveUp();
      };
      probe.onerror = function () { tries < MAX ? setTimeout(attempt, 2200) : giveUp(); };
      probe.src = url;
    }
    attempt();
  }

  ready(function () {
    var form = $("#au-form"), input = $("#au-url"), go = $("#au-go"), err = $("#au-err"),
      load = $("#au-load"), steps = document.querySelectorAll(".au-step"), report = $("#au-report"), out = $("#au-report-in");
    if (!form) return;
    var stepTimers = [], sharedMode = false;

    function showErr(m) { err.hidden = false; err.textContent = m; }
    function clearErr() { err.hidden = true; }
    function runSteps() {
      steps.forEach(function (s) { s.classList.remove("on", "done"); });
      var i = 0;
      function tick() {
        if (i > 0 && steps[i - 1]) { steps[i - 1].classList.remove("on"); steps[i - 1].classList.add("done"); }
        if (steps[i]) { steps[i].classList.add("on"); i++; stepTimers.push(setTimeout(tick, 1400)); }
      }
      tick();
    }
    function stopSteps() { stepTimers.forEach(clearTimeout); stepTimers = []; }

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      clearErr();
      var url = input.value.trim();
      if (!url || url.length < 4 || !/\.[a-z]{2,}/i.test(url)) { showErr("Entrez une adresse de site valide (ex. www.mon-site.fr)."); return; }
      var nom = ($("#au-nom") ? $("#au-nom").value.trim() : ""), ville = ($("#au-ville") ? $("#au-ville").value.trim() : "");
      sharedMode = false;
      go.disabled = true; go.setAttribute("aria-busy", "true");
      report.classList.remove("on"); load.classList.add("on"); runSteps();
      var data = null;
      try {
        var ctrl = new AbortController(); var to = setTimeout(function () { ctrl.abort(); }, 45000);
        var r = await fetch(API + "/audit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: url, nom: nom, ville: ville }), signal: ctrl.signal });
        clearTimeout(to);
        data = await r.json();
      } catch (_) { data = { ok: false, error: "L'analyse a pris trop de temps. Réessayez." }; }
      stopSteps(); load.classList.remove("on"); go.disabled = false; go.removeAttribute("aria-busy");
      if (!data || !data.ok) { showErr((data && data.error) || "Analyse impossible. Vérifiez l'adresse et réessayez."); return; }
      render(data);
    });

    function render(d) {
      var s = d.scores;
      var minis = s ? '<div class="mini-g">' + mini(s.perf, "Performance") + mini(s.seo, "SEO") + mini(s.a11y, "Accessibilité") + mini(s.bp, "Bonnes pratiques") + "</div>" : "";
      var issues = (d.issues || []).map(function (x) { return '<li class="no"><span class="ic">✗</span><span class="lbl">' + esc(x) + "</span></li>"; }).join("");
      var hidden = d.issuesHidden > 0 ? '<li class="no"><span class="ic">🔒</span><span class="lbl" style="color:var(--muted)">+ ' + d.issuesHidden + " autre(s) point(s) détecté(s) — détaillé(s) dans votre diagnostic</span></li>" : "";
      var prios = (d.priorities || []).map(function (p, i) {
        return '<div class="prio"><div class="pt"><span class="num">' + (i + 1) + '</span><h4>' + esc(p.title) + '</h4></div><div class="why">' + esc(p.why) + '</div><div class="act">🔒 <b>La solution concrète</b> fait partie de votre diagnostic offert.</div></div>';
      }).join("");
      var b = d.benchmark || { site: d.overall, standard: 62, fl: 96, sector: "autre", sample: 0 };
      function bar(label, v, c) {
        // Styles du remplissage écrits EN LIGNE (indépendants du CSS de la page) :
        // même si un audit.html en cache sert un vieux CSS sans display:block, la
        // barre colorée s'affiche quand même.
        var trackCss = "display:block;height:12px;border-radius:8px;background:rgba(255,255,255,.08);overflow:hidden";
        var fillCss = "display:block;height:100%;width:" + v + "%;border-radius:8px;background:" + c + ";color:" + c;
        return '<div class="bar"><span>' + esc(label) + '</span><span class="track" style="' + trackCss + '"><span class="fill" data-w="' + v + '%" style="' + fillCss + '"></span></span><b>' + v + "</b></div>";
      }
      var localTxt = d.localScore >= 3 ? "Bonne présence locale détectée." : d.localScore >= 1 ? "Présence Google locale incomplète — un point clé pour être trouvé près de chez vous." : "Aucune fiche Google / coordonnées claires détectées — vous passez à côté de recherches locales.";
      var secName = SECTORLBL[b.sector] || "votre secteur";

      // 4 piliers du Score de Présence en Ligne
      var pil = d.pillars, soc = d.social || { count: 0, platforms: [] };
      var pcards = pil ? '<div class="mini-cap">Votre présence en ligne, pilier par pilier</div><div class="pillars">' +
        pgauge(pil.site, "Site web", (s ? "Perf " + s.perf + "/100" : d.summary.weak + " à corriger")) +
        pgauge(pil.google, "Fiche Google", (d.places && d.places.rating != null ? d.places.rating + "★ · " + (d.places.reviews || 0) + " avis" : d.localScore + "/4 signaux")) +
        pgauge(pil.social, "Réseaux sociaux", (soc.count ? soc.count + " réseau" + (soc.count > 1 ? "x" : "") + " détecté" + (soc.count > 1 ? "s" : "") : "aucun détecté")) +
        pgauge(pil.reviews, "Avis & réputation", (d.places && d.places.reviews != null ? d.places.reviews + " avis Google" : "à renforcer")) +
        "</div>" : "";

      var proj = (d.projection && d.projection > d.overall) ? '<div class="rep-proj">🎯 En corrigeant vos priorités, votre score passerait de <b>' + d.overall + "</b> à <b>~" + d.projection + "</b>/100.</div>" : "";
      var delta = "";
      if (d.previous && d.previous.score != null) {
        var dv = d.overall - d.previous.score, cls = dv > 0 ? "up" : dv < 0 ? "down" : "flat", ar = dv > 0 ? "▲ +" + dv : dv < 0 ? "▼ " + dv : "= 0";
        delta = '<div class="rep-delta ' + cls + '">' + ar + " pts depuis votre dernier audit</div>";
      }
      var sharedBanner = sharedMode ? '<div class="shared-note">📊 Rapport d\'audit partagé — <a href="audit.html" style="color:var(--cyan);font-weight:700">analysez votre propre présence en ligne →</a></div>' : "";

      out.innerHTML =
        sharedBanner +
        '<div class="rep-top">' + gauge(d.overall, "sur 100") +
        '<div class="rep-verdict"><div class="rep-host">' + esc(d.host) + '</div><h2>' + verdict(d.overall) + '</h2><p>' + d.summary.strong + " points solides · <b style=\"color:#ff9a9a\">" + d.summary.weak + " à améliorer</b></p>" + proj + delta + "</div></div>" +
        pcards +
        (s ? '<div class="mini-cap">Détail technique de votre site (Google Lighthouse)</div><div class="mini-g">' + mini(s.perf, "Performance") + mini(s.seo, "SEO") + mini(s.a11y, "Accessibilité") + mini(s.bp, "Bonnes pratiques") + "</div>" : "") +
        '<div class="grid2">' +
        '<div class="panel"><h3>Ce qui pénalise votre présence</h3><ul class="checks">' + (issues || '<li class="ok"><span class="ic">✓</span><span class="lbl">Peu de faiblesses majeures — bravo.</span></li>') + hidden + "</ul>" +
        '<p style="margin-top:14px;color:var(--muted);font-size:13.5px">📍 ' + esc(localTxt) + "</p></div>" +
        '<div class="panel shot"><h3>Votre site vu par vos visiteurs</h3><div class="shot-wrap"><div class="shot-skel" id="au-shot-skel"><span class="sp"></span>Aperçu en cours de génération…</div><img id="au-shot" alt="Aperçu de ' + esc(d.host) + '"></div><div class="cap">Capture en direct</div></div>' +
        "</div>" +
        '<div class="panel" style="margin-top:22px"><h3>Où vous situez-vous ?</h3><div class="bench">' +
        bar("Votre présence", b.site, col(b.site)) + bar("Moyenne " + esc(secName), b.standard, "#8a8fa3") + bar("Un client FL-System", b.fl, "var(--cyan)") + "</div>" +
        (b.sample > 0 ? '<p style="margin-top:10px;color:var(--muted);font-size:12px">Moyenne calculée sur ' + b.sample + " audit(s) du secteur.</p>" : "") + "</div>" +
        '<div class="panel" style="margin-top:22px"><h3>Vos 3 priorités les plus rentables</h3><div class="plan">' + prios + "</div></div>" +
        '<div class="rep-cta"><h3>Recevez l\'audit complet + le plan d\'action détaillé</h3>' +
        '<p>Je vous envoie le rapport intégral (toutes les corrections, étape par étape) et on en parle 15 min, sans engagement.</p>' +
        '<form id="au-lead" class="au-form" style="justify-content:center"><input type="email" id="au-email" placeholder="votre@email.fr" required aria-label="Votre e-mail"><button class="btn-go" type="submit">Recevoir mon plan complet →</button></form>' +
        '<div id="au-lead-msg" style="margin-top:12px;font-size:14px"></div>' +
        '<div class="row sharebar"><button class="ghostbtn" onclick="window.print()">🖨️ Enregistrer en PDF</button><button class="ghostbtn" id="au-share">🔗 Lien de ce rapport</button><a class="ghostbtn" href="generateur.html">✨ Voir mon nouveau site</a></div></div>';

      report.classList.add("on");
      report.scrollIntoView({ behavior: "smooth", block: "start" });
      requestAnimationFrame(function () { out.querySelectorAll(".fill[data-w]").forEach(function (f) { f.style.width = f.getAttribute("data-w"); }); });
      pollShot(d.screenshot);

      window.__auditRendered = true;
      var lead = $("#au-lead"), msg = $("#au-lead-msg");
      lead.addEventListener("submit", async function (e) {
        e.preventDefault();
        var email = $("#au-email").value.trim();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { msg.style.color = "#ffb4b4"; msg.textContent = "Adresse e-mail invalide."; return; }
        var btn = lead.querySelector("button"); btn.disabled = true; msg.style.color = "var(--muted)"; msg.textContent = "Envoi…";
        try {
          var r = await fetch(API + "/lead", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email, url: d.url, auditId: d.auditId, source: "audit" }) });
          var j = await r.json();
          if (j && j.ok) { lead.style.display = "none"; msg.style.color = "#37d67a"; msg.innerHTML = "✅ C'est noté&nbsp;! Je vous envoie le rapport complet et je vous recontacte très vite."; }
          else throw 0;
        } catch (_) { btn.disabled = false; msg.style.color = "#ffb4b4"; msg.textContent = "Oups, réessayez dans un instant."; }
      });

      var share = $("#au-share");
      if (share) share.addEventListener("click", function () {
        var link = location.origin + "/audit.html?r=" + encodeURIComponent(d.auditId || "");
        function done() { share.textContent = "✅ Lien copié"; setTimeout(function () { share.innerHTML = "🔗 Lien de ce rapport"; }, 1800); }
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done, done);
        else { try { var t = document.createElement("input"); t.value = link; document.body.appendChild(t); t.select(); document.execCommand("copy"); document.body.removeChild(t); done(); } catch (_) {} }
      });
    }

    // Rapport partagé : ?r=<id> → on affiche un audit déjà passé (lecture).
    var rid = new URLSearchParams(location.search).get("r");
    if (rid && /^[a-z0-9-]{6,60}$/i.test(rid)) {
      sharedMode = true;
      load.classList.add("on"); runSteps();
      (async function () {
        var data = null;
        try { var r = await fetch(API + "/audit?id=" + encodeURIComponent(rid)); data = await r.json(); } catch (_) {}
        stopSteps(); load.classList.remove("on");
        if (data && data.ok) { render(data); }
        else { showErr("Ce rapport n'est plus disponible. Lancez votre propre analyse ci-dessus."); }
      })();
    }

    window.__auditRender = render; // hook de test (rendu avec données simulées)
  });
})();
