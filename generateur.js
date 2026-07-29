/* =====================================================================
   FL — Générateur de site instantané (Chantier 1)
   Moteur de direction artistique par secteur + renderer de page +
   pilotage UI (formulaire → /generate → rendu dans un cadre d'appareil).
   Le contenu vient du Worker (Workers AI + repli curaté) ; repli client
   si l'API est injoignable. Rendu isolé dans un <iframe srcdoc>.
   ===================================================================== */
(function () {
  "use strict";

  // Base de l'API (Worker). CORS autorise francoisleterrier.fr.
  var API = "https://main.francois-leterrier-cmw.workers.dev";
  var RM = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Direction artistique par secteur ---------- */
  var DA = {
    restaurant: { bg: "#14100c", surface: "#1e1813", ink: "#f5ead6", muted: "#b9a98f", accent: "#c9a86a", accent2: "#c9a86a", line: "rgba(201,168,106,.18)", light: false, disp: "'Playfair Display', Georgia, serif", body: "'Inter', system-ui, sans-serif", hero: "modeles/img/resto-hero.webp", ph: "modeles/img/resto-planches.webp", radius: "4px" },
    artisan: { bg: "#12181f", surface: "#1a222c", ink: "#eaf0f6", muted: "#9fb0c2", accent: "#f0a04b", accent2: "#f0a04b", line: "rgba(240,160,75,.18)", light: false, disp: "'Oswald', Impact, sans-serif", body: "'Inter', system-ui, sans-serif", hero: "modeles/img/artisan-hero.webp", ph: "modeles/img/artisan-chantier.webp", radius: "3px" },
    commerce: { bg: "#fbeef3", surface: "#ffffff", ink: "#4a2a38", muted: "#8a6d78", accent: "#c65b8e", accent2: "#b83f76", line: "rgba(74,42,56,.14)", light: true, disp: "'Cormorant Garamond', Georgia, serif", body: "'Jost', system-ui, sans-serif", hero: "modeles/img/commerce-hero.webp", ph: "modeles/img/commerce-collection.webp", radius: "2px" },
    "bien-etre": { bg: "#f2eee4", surface: "#ffffff", ink: "#3a4a3f", muted: "#6f7d70", accent: "#7d9b7e", accent2: "#5f7d63", line: "rgba(58,74,63,.14)", light: true, disp: "'Cormorant Garamond', Georgia, serif", body: "'Nunito Sans', system-ui, sans-serif", hero: "modeles/img/bienetre-hero.webp", ph: "modeles/img/bienetre-nature.webp", radius: "14px" },
    coiffure: { bg: "#0f0b0e", surface: "#171115", ink: "#f0e6ec", muted: "#b6a6b0", accent: "#e0a89a", accent2: "#e8b3a0", line: "rgba(232,179,160,.18)", light: false, disp: "'Cormorant Garamond', Georgia, serif", body: "'Jost', system-ui, sans-serif", hero: "modeles/img/coiffure-salon.webp", ph: "modeles/img/coiffure-couleur.webp", radius: "2px" },
    evenementiel: { bg: "#1a1020", surface: "#241630", ink: "#f3e7ef", muted: "#b9a6c2", accent: "#d9a24a", accent2: "#c77dd6", line: "rgba(224,168,208,.18)", light: false, disp: "'Playfair Display', Georgia, serif", body: "'Jost', system-ui, sans-serif", hero: "modeles/img/fairepart-couple.webp", ph: "modeles/img/fairepart-histoire.webp", radius: "6px" },
    default: { bg: "#0b0a14", surface: "#14131f", ink: "#f2ecf4", muted: "#b9b3c6", accent: "#28c8dd", accent2: "#7c3aed", line: "rgba(255,255,255,.1)", light: false, disp: "'Fraunces', Georgia, serif", body: "'Inter', system-ui, sans-serif", hero: "", ph: "", radius: "12px" },
  };
  var FONT_HREF =
    "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;1,600&family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Inter:wght@400;600;700&family=Jost:wght@400;600&family=Nunito+Sans:wght@400;700&family=Oswald:wght@400;600&family=Playfair+Display:ital,wght@0,500;0,700;1,600&display=swap";

  /* ---------- utilitaires ---------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  // échappe puis réautorise <em>…</em> (mot fort du titre)
  function rich(s) {
    return esc(s).replace(/&lt;em&gt;/g, "<em>").replace(/&lt;\/em&gt;/g, "</em>");
  }

  /* ---------- Renderer : page JSON → document HTML (pour l'iframe) ---------- */
  function renderPage(page, opts) {
    opts = opts || {};
    var origin = opts.origin || "";
    var d = DA[page.sector] || DA.default;
    var heroUrl = d.hero ? origin + "/" + d.hero : "";
    var phUrl = d.ph ? origin + "/" + d.ph : "";
    var overlay = d.light
      ? "linear-gradient(180deg,rgba(255,255,255,.55),rgba(255,255,255,.9))"
      : "linear-gradient(180deg,rgba(0,0,0,.5),rgba(0,0,0,.86))";
    var heroShadow = d.light ? "0 1px 3px rgba(255,255,255,.9)" : "0 2px 20px rgba(0,0,0,.6)";

    function svc(s) {
      return (
        '<article class="card">' +
        "<h3>" + esc(s.title) + "</h3>" +
        "<p>" + esc(s.desc) + "</p>" +
        (s.price ? '<div class="price">' + esc(s.price) + "</div>" : "") +
        "</article>"
      );
    }
    function proof(p) {
      return '<figure class="t"><blockquote>' + esc(p.quote) + "</blockquote><figcaption>— " + esc(p.author) + "</figcaption></figure>";
    }
    function faq(f) {
      return "<details><summary>" + esc(f.q) + "</summary><p>" + esc(f.a) + "</p></details>";
    }

    var css =
      ":root{--bg:" + d.bg + ";--sf:" + d.surface + ";--ink:" + d.ink + ";--mut:" + d.muted + ";--ac:" + d.accent + ";--ac2:" + d.accent2 + ";--ln:" + d.line + ";--r:" + d.radius + ";--hsh:" + heroShadow + "}" +
      "*{box-sizing:border-box;margin:0;padding:0}html{scroll-behavior:smooth}" +
      "body{font-family:" + d.body + ";background:var(--bg);color:var(--ink);line-height:1.6;-webkit-font-smoothing:antialiased}" +
      "img{max-width:100%;display:block}h1,h2,h3{font-family:" + d.disp + ";font-weight:600;line-height:1.1;letter-spacing:-.01em}" +
      ".wrap{max-width:1080px;margin:0 auto;padding:0 24px}" +
      "header.nav{position:sticky;top:0;z-index:5;display:flex;align-items:center;justify-content:space-between;padding:16px 24px;background:color-mix(in srgb,var(--bg) 86%,transparent);backdrop-filter:blur(10px);border-bottom:1px solid var(--ln)}" +
      ".brand{font-family:" + d.disp + ";font-size:22px;font-weight:600}.nav a.cta{font-family:" + d.body + ";font-size:13px;font-weight:600;color:var(--bg);background:var(--ac);padding:10px 18px;border-radius:var(--r);text-decoration:none}" +
      ".hero{position:relative;min-height:74vh;display:flex;align-items:center;text-align:center;padding:90px 0;" + (heroUrl ? "background:" + overlay + ",url('" + heroUrl + "') center/cover" : "background:radial-gradient(120% 90% at 50% 0%,color-mix(in srgb,var(--ac) 22%,transparent),transparent 60%),var(--bg)") + "}" +
      ".hero .eyebrow{font-family:" + d.body + ";font-size:12px;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:var(--ac);text-shadow:var(--hsh)}" +
      ".hero h1{font-size:clamp(40px,8vw,84px);margin:18px 0;text-shadow:var(--hsh)}.hero h1 em{font-style:italic;color:var(--ac)}" +
      ".hero p.sub{max-width:640px;margin:0 auto 30px;font-size:clamp(16px,2.4vw,20px);color:var(--ink);opacity:.92;text-shadow:var(--hsh)}" +
      ".btns{display:flex;gap:14px;justify-content:center;flex-wrap:wrap}" +
      ".btn{font-family:" + d.body + ";font-size:15px;font-weight:600;padding:15px 30px;border-radius:var(--r);text-decoration:none;cursor:pointer;border:1px solid var(--ac)}" +
      ".btn.p{background:var(--ac);color:var(--bg)}.btn.s{background:transparent;color:var(--ink)}" +
      "section{padding:84px 0}.eyebrow2{font-family:" + d.body + ";font-size:12px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--ac);text-align:center}" +
      "h2.sec{font-size:clamp(28px,5vw,44px);text-align:center;margin:10px 0 44px}" +
      ".grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:22px}" +
      ".card{background:var(--sf);border:1px solid var(--ln);border-radius:calc(var(--r) + 8px);padding:28px}" +
      ".card h3{font-size:22px;margin-bottom:10px}.card p{color:var(--mut);font-size:15px}.card .price{margin-top:14px;font-family:" + d.disp + ";font-size:19px;color:var(--ac)}" +
      ".about{display:grid;grid-template-columns:1.1fr .9fr;gap:48px;align-items:center}" +
      ".about .im{border-radius:calc(var(--r) + 10px);overflow:hidden;aspect-ratio:4/3;" + (phUrl ? "background:url('" + phUrl + "') center/cover" : "background:var(--sf)") + "}" +
      ".about h2{font-size:clamp(26px,4vw,40px);margin-bottom:16px;text-align:left}.about p{color:var(--mut);font-size:17px}" +
      ".proofs{background:var(--sf);border-top:1px solid var(--ln);border-bottom:1px solid var(--ln)}" +
      ".tg{display:grid;grid-template-columns:repeat(3,1fr);gap:22px}" +
      ".t{background:var(--bg);border:1px solid var(--ln);border-radius:calc(var(--r) + 8px);padding:26px}.t blockquote{font-size:15.5px;font-style:italic}.t figcaption{margin-top:14px;font-size:13px;color:var(--mut)}" +
      ".faq{max-width:760px;margin:0 auto}details{border-bottom:1px solid var(--ln);padding:18px 4px}summary{cursor:pointer;font-family:" + d.disp + ";font-size:20px;list-style:none}summary::-webkit-details-marker{display:none}details p{color:var(--mut);margin-top:10px}" +
      ".cta{text-align:center;background:radial-gradient(120% 100% at 50% 0%,color-mix(in srgb,var(--ac) 20%,transparent),transparent 60%)}" +
      ".cta h2{font-size:clamp(30px,6vw,52px)}.cta p{color:var(--mut);margin:14px 0 28px;font-size:18px}" +
      "footer{padding:48px 24px;border-top:1px solid var(--ln);text-align:center;color:var(--mut);font-size:14px}" +
      "footer .fb{font-family:" + d.disp + ";font-size:20px;color:var(--ink);margin-bottom:8px}" +
      ".reveal{transition:opacity .6s ease,transform .6s ease}.js .reveal{opacity:0;transform:translateY(16px)}.js .reveal.in{opacity:1;transform:none}" +
      "@media(prefers-reduced-motion:reduce){.js .reveal{opacity:1!important;transform:none!important;transition:none}html{scroll-behavior:auto}}" +
      "@media(max-width:820px){.grid3,.tg{grid-template-columns:1fr}.about{grid-template-columns:1fr;gap:28px}.about h2{text-align:center}}";

    var body =
      '<header class="nav"><span class="brand">' + esc(page.brand) + '</span><a class="cta" href="#contact">' + esc(page.cta.button) + "</a></header>" +
      '<section class="hero"><div class="wrap">' +
      '<div class="eyebrow">' + esc(page.hero.eyebrow) + "</div>" +
      "<h1>" + rich(page.hero.title) + "</h1>" +
      '<p class="sub">' + esc(page.hero.subtitle) + "</p>" +
      '<div class="btns"><a class="btn p" href="#contact">' + esc(page.hero.ctaPrimary) + '</a><a class="btn s" href="#offre">' + esc(page.hero.ctaSecondary) + "</a></div>" +
      "</div></section>" +
      '<section id="offre"><div class="wrap"><div class="eyebrow2">Nos prestations</div><h2 class="sec">Ce que nous proposons</h2>' +
      '<div class="grid3 reveal">' + page.services.map(svc).join("") + "</div></div></section>" +
      '<section><div class="wrap about reveal"><div><h2>' + esc(page.about.title) + "</h2><p>" + esc(page.about.body) + "</p></div><div class=\"im\" role=\"img\" aria-label=\"Ambiance\"></div></div></section>" +
      '<section class="proofs"><div class="wrap"><div class="eyebrow2">Ils en parlent</div><h2 class="sec">Vos avis</h2><div class="tg reveal">' + page.proofs.map(proof).join("") + "</div></div></section>" +
      '<section><div class="wrap"><div class="eyebrow2">Questions fréquentes</div><h2 class="sec">Bon à savoir</h2><div class="faq reveal">' + page.faq.map(faq).join("") + "</div></div></section>" +
      '<section id="contact" class="cta"><div class="wrap"><h2>' + esc(page.cta.title) + "</h2><p>" + esc(page.cta.subtitle) + '</p><div class="btns"><a class="btn p" href="#">' + esc(page.cta.button) + "</a></div></div></section>" +
      '<footer><div class="fb">' + esc(page.brand) + "</div>" + esc(page.contact.ville) + (page.contact.hours ? " · " + esc(page.contact.hours) : "") + "</footer>";

    // Contenu visible par défaut ; l'animation ne s'active que si JS tourne
    // (classe .js posée en tête). Si IntersectionObserver manque → tout révélé.
    var reveal =
      '<script>(function(){var els=document.querySelectorAll(".reveal");' +
      'if(!("IntersectionObserver" in window)){els.forEach(function(el){el.classList.add("in")});return}' +
      'var o=new IntersectionObserver(function(e){e.forEach(function(x){if(x.isIntersecting){x.target.classList.add("in");o.unobserve(x.target)}})},{threshold:.12});' +
      'els.forEach(function(el){o.observe(el)})})();<\/script>';

    return (
      "<!doctype html><html lang=\"fr\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
      "<script>document.documentElement.className='js'<\/script>" +
      (origin ? '<base href="' + origin + '/">' : "") +
      '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="' + FONT_HREF + '">' +
      "<title>" + esc(page.brand) + "</title><style>" + css + "</style></head><body>" + body + reveal + "</body></html>"
    );
  }

  /* ---------- Repli client (si l'API est injoignable) ---------- */
  function localCurated(input) {
    var s = sectorClient(input.metier);
    var n = input.nom || "Votre établissement", v = input.ville || "votre ville";
    var packs = {
      restaurant: { eb: "Bar à vin · Cuisine de partage", t: "Le goût du <em>partage</em>", sub: "Une cave vivante, une cuisine franche, des soirées qui s'étirent." },
      artisan: { eb: "Intervention rapide · Devis gratuit", t: "Un travail <em>bien fait</em>", sub: "On intervient vite, avec des tarifs annoncés d'avance et une garantie." },
      commerce: { eb: "Boutique · Conseil personnalisé", t: "Des pièces qu'on <em>aime porter</em>", sub: "Une sélection pointue et un accueil qui prend le temps." },
      "bien-etre": { eb: "Accompagnement · Bien-être", t: "Reprenez votre <em>souffle</em>", sub: "Un espace calme pour relâcher la pression et retrouver de l'énergie." },
      coiffure: { eb: "Coiffure · Coloriste", t: "Votre style, <em>sublimé</em>", sub: "Une coupe pensée pour vous et un moment rien qu'à vous." },
      evenementiel: { eb: "Événementiel · Sur-mesure", t: "Des moments <em>inoubliables</em>", sub: "On imagine et orchestre vos plus beaux événements." },
      default: { eb: "Votre établissement", t: "Bienvenue chez <em>nous</em>", sub: "Un savoir-faire à votre service, avec exigence et proximité." },
    };
    var p = packs[s] || packs.default;
    var svcNames = { restaurant: ["La carte", "La cave", "Privatisation"], artisan: ["Dépannage", "Rénovation", "Entretien"], commerce: ["La sélection", "Conseil en style", "Click & Collect"], "bien-etre": ["Séance individuelle", "Gestion du stress", "Séances en groupe"], coiffure: ["Coupe & coiffage", "Couleur", "Soins"], evenementiel: ["Mariages", "Événements pros", "Coordination"], default: ["Savoir-faire", "Accompagnement", "Proximité"] };
    var names = svcNames[s] || svcNames.default;
    return {
      brand: n, sector: s, ville: v,
      hero: { eyebrow: p.eb + " · " + v, title: p.t, subtitle: n + " — " + p.sub, ctaPrimary: "Nous contacter", ctaSecondary: "En savoir plus" },
      services: names.map(function (nm) { return { title: nm, desc: "Un service pensé pour vous, avec le souci du détail.", price: "" }; }),
      about: { title: "Qui sommes-nous", body: n + ", à " + v + ", c'est l'exigence du travail bien fait et le goût du contact." },
      proofs: [{ quote: "Sérieux, à l'écoute, efficace. Je recommande vivement.", author: "Client satisfait" }, { quote: "Un accompagnement de qualité du début à la fin.", author: "Cliente fidèle" }, { quote: "Professionnalisme et proximité. Rien à redire.", author: "Client local" }],
      faq: [{ q: "Comment vous contacter ?", a: "Par téléphone ou via le formulaire — réponse rapide." }, { q: "Où êtes-vous situés ?", a: "À " + v + " et alentour." }, { q: "Un premier échange ?", a: "Oui, sans engagement." }],
      cta: { title: "Contactez-nous", subtitle: "On sera ravis d'échanger.", button: "Nous contacter" },
      contact: { ville: v, phone: "", hours: "Sur rendez-vous" },
      _source: "local",
    };
  }
  function sectorClient(m) {
    m = (m || "").toLowerCase();
    var map = [["restaurant", ["restau", "bar", "vin", "café", "cafe", "brasserie", "tapas", "cave"]], ["artisan", ["plomb", "artisan", "btp", "chauff", "électric", "electric", "maçon", "macon", "menuis", "couvreur", "peintre", "rénov", "renov"]], ["commerce", ["boutique", "commerce", "mode", "déco", "deco", "fleur", "bijou"]], ["bien-etre", ["bien-être", "bien être", "sophro", "yoga", "massage", "thérap", "therap", "naturo", "spa"]], ["coiffure", ["coiff", "beauté", "beaute", "esthé", "esthe", "barbier", "ongle", "salon"]], ["evenementiel", ["mariage", "faire-part", "événement", "evenement", "wedding", "réception", "reception"]]];
    for (var i = 0; i < map.length; i++) if (map[i][1].some(function (w) { return m.indexOf(w) > -1; })) return map[i][0];
    return "default";
  }

  /* ---------- Pilotage UI ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function ready(fn) { document.readyState !== "loading" ? fn() : document.addEventListener("DOMContentLoaded", fn); }

  ready(function () {
    var form = $("#gen-form"), frame = $("#gen-frame"), stage = $("#gen-stage"),
      skel = $("#gen-skel"), errBox = $("#gen-err"), submitBtn = $("#gen-go"),
      deviceBtns = document.querySelectorAll("[data-device]"), redo = $("#gen-redo"), share = $("#gen-share");
    if (!form) return;
    var origin = location.origin, lastInput = null;

    function setDevice(mode) {
      stage.setAttribute("data-device", mode);
      deviceBtns.forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-device") === mode); });
    }
    deviceBtns.forEach(function (b) { b.addEventListener("click", function () { setDevice(b.getAttribute("data-device")); }); });

    function show(el, on) { if (el) el.hidden = !on; }

    async function generate(input) {
      lastInput = input;
      show(errBox, false); show(skel, true); show(frame, false);
      submitBtn.disabled = true; submitBtn.setAttribute("aria-busy", "true");
      stage.hidden = false;
      var page = null;
      try {
        var ctrl = new AbortController(); var to = setTimeout(function () { ctrl.abort(); }, 15000);
        var r = await fetch(API + "/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal: ctrl.signal });
        clearTimeout(to);
        if (r.ok) { var j = await r.json(); if (j && j.ok && j.page) page = j.page; }
      } catch (_) { /* réseau/CORS → repli client */ }
      if (!page) page = localCurated(input);
      // petit délai pour laisser voir le squelette (effet « ça se construit »)
      await new Promise(function (res) { setTimeout(res, RM ? 0 : 350); });
      frame.setAttribute("srcdoc", renderPage(page, { origin: origin }));
      show(skel, false); show(frame, true);
      submitBtn.disabled = false; submitBtn.removeAttribute("aria-busy");
      if (share) share.hidden = false;
      if (redo) redo.hidden = false;
      frame.dataset.source = page._source || "";
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var input = {
        metier: $("#f-metier").value.trim(),
        nom: $("#f-nom").value.trim(),
        ville: $("#f-ville").value.trim(),
        ton: (form.querySelector('input[name="ton"]:checked') || {}).value || "chaleureux",
      };
      if (!input.metier || !input.nom) { show(errBox, true); errBox.textContent = "Indiquez au moins votre métier et le nom de votre établissement."; return; }
      generate(input);
    });
    if (redo) redo.addEventListener("click", function () { if (lastInput) generate(lastInput); });
    setDevice("desktop");
  });

  // exposé pour tests
  window.__flGen = { renderPage: renderPage, localCurated: localCurated };
})();
