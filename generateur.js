/* =====================================================================
   FL — Générateur de site instantané (Chantier 1)
   Le TON pilote un vrai système de design (couleur, composition, forme,
   typo, espacement) ; le MÉTIER apporte l'univers (images + accent + copy).
   Changer le ton → design radicalement différent. Rendu isolé en <iframe>.
   ===================================================================== */
(function () {
  "use strict";

  var API = "https://main.francois-leterrier-cmw.workers.dev";

  /* ---------- Accent + images par métier ---------- */
  var SECTOR_ACCENT = {
    restaurant: "#b07a2e", artisan: "#c56a1e", commerce: "#b83f76",
    "bien-etre": "#3d7150", coiffure: "#bd6a58", evenementiel: "#8f45c0", default: "#1f8fbf",
  };
  var SECTOR_IMG = {
    restaurant: { hero: "modeles/img/resto-hero.webp", ph: "modeles/img/resto-planches.webp" },
    artisan: { hero: "modeles/img/artisan-hero.webp", ph: "modeles/img/artisan-chantier.webp" },
    commerce: { hero: "modeles/img/commerce-hero.webp", ph: "modeles/img/commerce-collection.webp" },
    "bien-etre": { hero: "modeles/img/bienetre-hero.webp", ph: "modeles/img/bienetre-nature.webp" },
    coiffure: { hero: "modeles/img/coiffure-salon.webp", ph: "modeles/img/coiffure-couleur.webp" },
    evenementiel: { hero: "modeles/img/fairepart-couple.webp", ph: "modeles/img/fairepart-histoire.webp" },
    default: { hero: "modeles/img/commerce-vitrine.webp", ph: "modeles/img/commerce-detail.webp" },
  };

  /* ---------- 5 systèmes de design (TON) ---------- */
  var G = {
    playfair: "'Playfair Display', Georgia, serif",
    cormorant: "'Cormorant Garamond', Georgia, serif",
    fraunces: "'Fraunces', Georgia, serif",
    oswald: "'Oswald', Impact, sans-serif",
    inter: "'Inter', system-ui, sans-serif",
    jost: "'Jost', system-ui, sans-serif",
  };
  var TONS = {
    chaleureux: {
      light: true, bg: "#f7f1e8", sf: "#fffdf9", ink: "#3a2e26", mut: "#7a6c5f", line: "rgba(58,46,38,.13)",
      disp: G.playfair, body: G.inter, upper: false, radius: "16px", btnR: "30px",
      hero: "full", card: "soft", pad: 88, ls: ".14em", accent: "sector",
    },
    dynamique: {
      light: false, bg: "#0d0d13", sf: "#181820", ink: "#f4f6fb", mut: "#9ea3b6", line: "rgba(255,255,255,.1)",
      disp: G.oswald, body: G.inter, upper: true, radius: "2px", btnR: "2px",
      hero: "split", card: "bold", pad: 66, ls: ".18em", accent: "sector",
    },
    "élégant": {
      light: true, bg: "#f4f2ee", sf: "#fbfaf8", ink: "#2b2a27", mut: "#89867e", line: "rgba(43,42,39,.16)",
      disp: G.cormorant, body: G.jost, upper: false, radius: "0", btnR: "0",
      hero: "clean", card: "hairline", pad: 116, ls: ".28em", accent: "sector",
    },
    rassurant: {
      light: true, bg: "#f4f7fb", sf: "#ffffff", ink: "#26303a", mut: "#5f6b7a", line: "rgba(38,48,58,.12)",
      disp: G.jost, body: G.inter, upper: false, radius: "12px", btnR: "10px",
      hero: "left", card: "filled", pad: 84, ls: ".12em", accent: "sector", badges: true,
    },
    "haut de gamme": {
      light: false, bg: "#0c0b0a", sf: "#151310", ink: "#f0ebe2", mut: "#ab9f8f", line: "rgba(201,168,106,.22)",
      disp: G.playfair, body: G.jost, upper: false, radius: "0", btnR: "0",
      hero: "grand", card: "minimal", pad: 128, ls: ".34em", accent: "gold",
    },
  };

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function rich(s) { return esc(s).replace(/&lt;em&gt;/g, "<em>").replace(/&lt;\/em&gt;/g, "</em>"); }
  function lum(hex) { var m = hex.replace("#", ""); var r = parseInt(m.substr(0, 2), 16) / 255, g = parseInt(m.substr(2, 2), 16) / 255, b = parseInt(m.substr(4, 2), 16) / 255; var f = function (v) { return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); }
  function textOn(hex) { return lum(hex) > .18 ? "#151515" : "#fff"; }

  function buildTheme(sector, ton) {
    var t = TONS[ton] || TONS.chaleureux;
    var img = SECTOR_IMG[sector] || SECTOR_IMG.default;
    var accent = t.accent === "gold" ? "#c9a86a" : (SECTOR_ACCENT[sector] || SECTOR_ACCENT.default);
    var th = {};
    for (var k in t) th[k] = t[k];
    th.accent = accent;
    th.onAccent = textOn(accent);
    th.hero_img = img.hero;
    th.ph_img = img.ph;
    return th;
  }

  /* ---------- Renderer ---------- */
  function renderPage(page, opts) {
    opts = opts || {};
    var origin = opts.origin || "";
    var th = buildTheme(page.sector, page.ton);
    var heroUrl = origin + "/" + th.hero_img;
    var phUrl = origin + "/" + th.ph_img;
    var overlay = th.light
      ? "linear-gradient(180deg,rgba(255,255,255,.55),rgba(255,255,255,.88))"
      : "linear-gradient(160deg,rgba(0,0,0,.5),rgba(0,0,0,.84))";
    var hsh = th.light ? "0 1px 3px rgba(255,255,255,.9)" : "0 2px 22px rgba(0,0,0,.6)";
    var pad = th.pad, padS = Math.round(pad * .8);

    /* boutons */
    function btn(cls, label, href) {
      return '<a class="btn ' + cls + '" href="' + (href || "#contact") + '">' + esc(label) + "</a>";
    }
    /* cartes de service selon le style */
    function svc(s, i) {
      if (th.card === "minimal")
        return '<article class="card"><span class="idx">' + ("0" + (i + 1)).slice(-2) + '</span><div><h3>' + esc(s.title) + "</h3><p>" + esc(s.desc) + "</p>" + (s.price ? '<div class="price">' + esc(s.price) + "</div>" : "") + "</div></article>";
      return '<article class="card"><h3>' + esc(s.title) + "</h3><p>" + esc(s.desc) + "</p>" + (s.price ? '<div class="price">' + esc(s.price) + "</div>" : "") + "</article>";
    }
    var services = page.services.map(svc).join("");
    var proofs = page.proofs.map(function (p) { return '<figure class="t"><blockquote>' + esc(p.quote) + "</blockquote><figcaption>— " + esc(p.author) + "</figcaption></figure>"; }).join("");
    var faq = page.faq.map(function (f) { return "<details><summary>" + esc(f.q) + "</summary><p>" + esc(f.a) + "</p></details>"; }).join("");

    /* ---- hero selon le ton ---- */
    var eyebrow = '<div class="eyebrow">' + esc(page.hero.eyebrow) + "</div>";
    var h1 = "<h1>" + rich(page.hero.title) + "</h1>";
    var sub = '<p class="sub">' + esc(page.hero.subtitle) + "</p>";
    var btns = '<div class="btns">' + btn("p", page.hero.ctaPrimary) + btn("s", page.hero.ctaSecondary, "#offre") + "</div>";
    var badges = th.badges ? '<ul class="badges"><li>Devis gratuit</li><li>Sans engagement</li><li>Réponse rapide</li></ul>' : "";
    var hero;
    if (th.hero === "split")
      hero = '<section class="hero split"><div class="htext"><div class="wrapc">' + eyebrow + h1 + sub + btns + badges + '</div></div><div class="himg" role="img" aria-label="Ambiance"></div></section>';
    else if (th.hero === "left")
      hero = '<section class="hero left"><div class="htext"><div class="wrapc">' + eyebrow + h1 + sub + btns + badges + '</div></div><div class="himg" role="img" aria-label="Ambiance"></div></section>';
    else if (th.hero === "clean")
      hero = '<section class="hero clean"><div class="wrap">' + eyebrow + h1 + sub + btns + '</div><div class="hband" role="img" aria-label="Ambiance"></div></section>';
    else /* full / grand */
      hero = '<section class="hero full"><div class="wrap">' + eyebrow + h1 + sub + btns + "</div></section>";

    var aboutImgLeft = th.hero === "split" || th.hero === "left"; /* varie la composition */
    var about =
      '<section class="sec about ' + (aboutImgLeft ? "imgleft" : "") + '"><div class="wrap agrid reveal">' +
      (aboutImgLeft ? '<div class="im" role="img" aria-label="Ambiance"></div>' : "") +
      "<div><div class=\"eyebrow2\">À propos</div><h2>" + esc(page.about.title) + "</h2><p>" + esc(page.about.body) + "</p></div>" +
      (aboutImgLeft ? "" : '<div class="im" role="img" aria-label="Ambiance"></div>') +
      "</div></section>";

    var css =
      ":root{--bg:" + th.bg + ";--sf:" + th.sf + ";--ink:" + th.ink + ";--mut:" + th.mut + ";--ac:" + th.accent + ";--on:" + th.onAccent + ";--ln:" + th.line + ";--r:" + th.radius + ";--br:" + th.btnR + ";--hsh:" + hsh + "}" +
      "*{box-sizing:border-box;margin:0;padding:0}html{scroll-behavior:smooth}" +
      "body{font-family:" + th.body + ";background:var(--bg);color:var(--ink);line-height:1.62;-webkit-font-smoothing:antialiased}" +
      "img{max-width:100%;display:block}" +
      "h1,h2,h3{font-family:" + th.disp + ";line-height:1.08;letter-spacing:-.01em;font-weight:" + (th.disp === G.oswald ? "600" : th.disp === G.cormorant ? "600" : "600") + "}" +
      (th.upper ? "h1,h2,h3{text-transform:uppercase;letter-spacing:.01em}" : "") +
      ".wrap{max-width:1080px;margin:0 auto;padding:0 26px}.wrapc{max-width:560px}" +
      /* nav */
      "header.nav{position:sticky;top:0;z-index:6;display:flex;align-items:center;justify-content:space-between;padding:16px 26px;background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(10px);border-bottom:1px solid var(--ln)}" +
      ".brand{font-family:" + th.disp + ";font-size:21px;font-weight:600}" +
      ".nav .cta{font-family:" + th.body + ";font-size:12.5px;font-weight:700;color:var(--on);background:var(--ac);padding:10px 18px;border-radius:var(--br);text-decoration:none;letter-spacing:" + (th.upper ? ".08em" : "0") + ";text-transform:" + (th.upper ? "uppercase" : "none") + "}" +
      /* boutons */
      ".btn{font-family:" + th.body + ";font-size:14.5px;font-weight:700;padding:15px 30px;border-radius:var(--br);text-decoration:none;display:inline-block;border:1.5px solid var(--ac);letter-spacing:" + (th.upper ? ".08em" : "0") + ";text-transform:" + (th.upper ? "uppercase" : "none") + "}" +
      ".btn.p{background:var(--ac);color:var(--on)}.btn.s{background:transparent;color:var(--ink);border-color:var(--ln)}" +
      ".btns{display:flex;gap:13px;flex-wrap:wrap}" +
      /* eyebrows */
      ".eyebrow,.eyebrow2{font-family:" + th.body + ";font-size:12px;font-weight:700;letter-spacing:" + th.ls + ";text-transform:uppercase;color:var(--ac)}" +
      /* ---- HERO ---- */
      ".hero .eyebrow{text-shadow:var(--hsh)}" +
      ".hero.full,.hero.clean{text-align:center}" +
      ".hero.full{min-height:" + (th.hero === "grand" ? "88vh" : "76vh") + ";display:flex;align-items:center;padding:90px 0;background:" + overlay + ",url('" + heroUrl + "') center/cover}" +
      ".hero.full h1,.hero.full .sub,.hero.clean h1{text-shadow:var(--hsh)}" +
      ".hero .eyebrow{margin-bottom:16px}" +
      ".hero h1{font-size:clamp(38px," + (th.hero === "grand" ? "7vw,80px" : "8vw,82px") + ");margin:0 0 20px}.hero h1 em{font-style:italic;color:var(--ac)}" +
      (th.hero === "grand" ? ".hero.full h1{font-weight:500;letter-spacing:.02em}.hero.full .eyebrow{letter-spacing:.4em}" : "") +
      ".hero .sub{font-size:clamp(16px,2.3vw,20px);color:" + (th.hero === "full" || th.hero === "grand" || th.hero === "clean" ? "var(--ink)" : "var(--mut)") + ";opacity:.94;margin:0 0 30px;max-width:600px}" +
      ".hero.full .sub,.hero.clean .sub{margin-left:auto;margin-right:auto}.hero.full .btns,.hero.clean .btns{justify-content:center}" +
      /* split / left */
      ".hero.split,.hero.left{display:grid;grid-template-columns:1fr 1fr;min-height:" + (th.hero === "left" ? "70vh" : "78vh") + "}" +
      ".hero.split .htext,.hero.left .htext{display:flex;align-items:center;padding:60px 26px;background:var(--bg)}" +
      ".hero.left .htext{justify-content:flex-end}.hero.split .htext .wrapc,.hero.left .htext .wrapc{width:100%;max-width:520px}" +
      ".hero .himg{background:" + (th.light ? "linear-gradient(0deg,rgba(0,0,0,.06),rgba(0,0,0,.06))," : "") + "url('" + heroUrl + "') center/cover;min-height:340px}" +
      ".badges{list-style:none;display:flex;flex-wrap:wrap;gap:10px;margin-top:22px}.badges li{font-size:12.5px;font-weight:600;color:var(--ink);background:color-mix(in srgb,var(--ac) 14%,transparent);border:1px solid var(--ln);padding:6px 13px;border-radius:20px}.badges li::before{content:'✓ ';color:var(--ac);font-weight:800}" +
      /* clean */
      ".hero.clean{padding:100px 0 0}.hero.clean .hband{margin-top:64px;height:44vh;min-height:320px;background:url('" + heroUrl + "') center/cover}" +
      /* sections */
      ".sec{padding:" + pad + "px 0}.sec.tight{padding:" + padS + "px 0}h2.st{font-size:clamp(28px,5vw,44px);margin:8px 0 42px}.hero.full+.sec,.hero.split+.sec,.hero.left+.sec,.hero.clean+.sec{padding-top:" + pad + "px}" +
      ".center{text-align:center}" +
      /* offre */
      ".grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:" + (th.card === "hairline" || th.card === "minimal" ? "0" : "22px") + "}" +
      (th.card === "soft" ? ".card{background:var(--sf);border:1px solid var(--ln);border-radius:calc(var(--r) + 8px);padding:30px;box-shadow:0 18px 40px -30px rgba(0,0,0,.5)}" : "") +
      (th.card === "filled" ? ".card{background:var(--sf);border:1px solid var(--ln);border-top:3px solid var(--ac);border-radius:calc(var(--r) + 4px);padding:28px}" : "") +
      (th.card === "bold" ? ".card{background:var(--sf);border-radius:2px;padding:28px;position:relative;overflow:hidden}.card::before{content:'';position:absolute;top:0;left:0;width:100%;height:4px;background:var(--ac)}" : "") +
      (th.card === "hairline" ? ".card{padding:34px 26px;border-left:1px solid var(--ln)}.grid3>.card:first-child{border-left:0}" : "") +
      (th.card === "minimal" ? ".card{display:flex;gap:20px;padding:30px 0;border-top:1px solid var(--ln)}.card .idx{font-family:" + th.disp + ";font-size:26px;color:var(--ac);opacity:.7}" : "") +
      ".card h3{font-size:" + (th.upper ? "19px" : "22px") + ";margin-bottom:10px}.card p{color:var(--mut);font-size:15px}.card .price{margin-top:14px;font-family:" + th.disp + ";font-size:19px;color:var(--ac)}" +
      /* about */
      ".about .agrid{display:grid;grid-template-columns:1fr 1fr;gap:52px;align-items:center}.about h2{font-size:clamp(26px,4vw,40px);margin:8px 0 16px}.about p{color:var(--mut);font-size:17px}.about .im{border-radius:var(--r);aspect-ratio:4/3;background:url('" + phUrl + "') center/cover}" +
      /* proofs */
      ".proofs{background:var(--sf);border-top:1px solid var(--ln);border-bottom:1px solid var(--ln)}.tg{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}.t{background:var(--bg);border:1px solid var(--ln);border-radius:var(--r);padding:26px}.t blockquote{font-size:15px;font-style:" + (th.upper ? "normal" : "italic") + "}.t figcaption{margin-top:14px;font-size:13px;color:var(--mut)}" +
      /* faq */
      ".faq{max-width:760px;margin:0 auto}details{border-bottom:1px solid var(--ln);padding:18px 4px}summary{cursor:pointer;font-family:" + th.disp + ";font-size:" + (th.upper ? "17px" : "20px") + ";list-style:none}summary::-webkit-details-marker{display:none}details p{color:var(--mut);margin-top:10px}" +
      /* cta + footer */
      ".ctaband{text-align:center;background:radial-gradient(120% 100% at 50% 0%,color-mix(in srgb,var(--ac) 18%,transparent),transparent 60%)}.ctaband h2{font-size:clamp(30px,6vw,52px)}.ctaband p{color:var(--mut);margin:14px 0 28px;font-size:18px}.ctaband .btns{justify-content:center}" +
      "footer{padding:46px 26px;border-top:1px solid var(--ln);text-align:center;color:var(--mut);font-size:14px}footer .fb{font-family:" + th.disp + ";font-size:20px;color:var(--ink);margin-bottom:8px}" +
      /* reveal */
      ".reveal{transition:opacity .6s ease,transform .6s ease}.js .reveal{opacity:0;transform:translateY(16px)}.js .reveal.in{opacity:1;transform:none}" +
      "@media(prefers-reduced-motion:reduce){.js .reveal{opacity:1!important;transform:none!important;transition:none}html{scroll-behavior:auto}}" +
      /* responsive */
      "@media(max-width:820px){.hero.split,.hero.left{grid-template-columns:1fr}.hero.split .himg,.hero.left .himg{min-height:260px;order:-1}.hero.left .htext{justify-content:flex-start}.grid3,.tg,.about .agrid{grid-template-columns:1fr}.about .agrid>.im{order:-1}.card{border-left:0!important}}";

    var body =
      '<header class="nav"><span class="brand">' + esc(page.brand) + '</span><a class="cta" href="#contact">' + esc(page.cta.button) + "</a></header>" +
      hero +
      '<section id="offre" class="sec center"><div class="wrap"><div class="eyebrow2">Nos prestations</div><h2 class="st">Ce que nous proposons</h2><div class="grid3 reveal">' + services + "</div></div></section>" +
      about +
      '<section class="sec proofs center"><div class="wrap"><div class="eyebrow2">Ils en parlent</div><h2 class="st">Vos avis</h2><div class="tg reveal">' + proofs + "</div></div></section>" +
      '<section class="sec center"><div class="wrap"><div class="eyebrow2">Questions fréquentes</div><h2 class="st">Bon à savoir</h2><div class="faq reveal">' + faq + "</div></div></section>" +
      '<section id="contact" class="sec ctaband"><div class="wrap"><h2>' + esc(page.cta.title) + "</h2><p>" + esc(page.cta.subtitle) + "</p>" + '<div class="btns">' + btn("p", page.cta.button) + "</div></div></section>" +
      '<footer><div class="fb">' + esc(page.brand) + "</div>" + esc(page.contact.ville) + (page.contact.hours ? " · " + esc(page.contact.hours) : "") + "</footer>";

    var reveal =
      '<script>(function(){var els=document.querySelectorAll(".reveal");if(!("IntersectionObserver" in window)){els.forEach(function(el){el.classList.add("in")});return}var o=new IntersectionObserver(function(e){e.forEach(function(x){if(x.isIntersecting){x.target.classList.add("in");o.unobserve(x.target)}})},{threshold:.12});els.forEach(function(el){o.observe(el)})})();<\/script>';

    return (
      "<!doctype html><html lang=\"fr\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
      "<script>document.documentElement.className='js'<\/script>" +
      (origin ? '<base href="' + origin + '/">' : "") +
      '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,600&family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Inter:wght@400;600;700&family=Jost:wght@400;500;600&family=Oswald:wght@500;600&family=Playfair+Display:ital,wght@0,500;0,600;1,600&display=swap">' +
      "<title>" + esc(page.brand) + "</title><style>" + css + "</style></head><body>" + body + reveal + "</body></html>"
    );
  }

  /* ---------- Repli client curaté ---------- */
  function sectorClient(m) {
    m = (m || "").toLowerCase();
    var map = [["restaurant", ["restau", "bar", "vin", "café", "cafe", "brasserie", "tapas", "cave"]], ["artisan", ["plomb", "artisan", "btp", "chauff", "électric", "electric", "maçon", "macon", "menuis", "couvreur", "peintre", "rénov", "renov"]], ["commerce", ["boutique", "commerce", "mode", "déco", "deco", "fleur", "bijou"]], ["bien-etre", ["bien-être", "bien être", "sophro", "yoga", "massage", "thérap", "therap", "naturo", "spa"]], ["coiffure", ["coiff", "beauté", "beaute", "esthé", "esthe", "barbier", "ongle", "salon"]], ["evenementiel", ["mariage", "faire-part", "événement", "evenement", "wedding", "réception", "reception"]]];
    for (var i = 0; i < map.length; i++) if (map[i][1].some(function (w) { return m.indexOf(w) > -1; })) return map[i][0];
    return "default";
  }
  function localCurated(input) {
    var s = sectorClient(input.metier), n = input.nom || "Votre établissement", v = input.ville || "votre ville";
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
      brand: n, sector: s, ton: input.ton || "chaleureux", ville: v,
      hero: { eyebrow: p.eb + " · " + v, title: p.t, subtitle: n + " — " + p.sub, ctaPrimary: "Nous contacter", ctaSecondary: "En savoir plus" },
      services: names.map(function (nm) { return { title: nm, desc: "Un service pensé pour vous, avec le souci du détail.", price: "" }; }),
      about: { title: "Qui sommes-nous", body: n + ", à " + v + ", c'est l'exigence du travail bien fait et le goût du contact." },
      proofs: [{ quote: "Sérieux, à l'écoute, efficace. Je recommande vivement.", author: "Client satisfait" }, { quote: "Un accompagnement de qualité du début à la fin.", author: "Cliente fidèle" }, { quote: "Professionnalisme et proximité. Rien à redire.", author: "Client local" }],
      faq: [{ q: "Comment vous contacter ?", a: "Par téléphone ou via le formulaire — réponse rapide." }, { q: "Où êtes-vous situés ?", a: "À " + v + " et alentour." }, { q: "Un premier échange ?", a: "Oui, sans engagement." }],
      cta: { title: "Contactez-nous", subtitle: "On sera ravis d'échanger.", button: "Nous contacter" },
      contact: { ville: v, phone: "", hours: "Sur rendez-vous" }, _source: "local",
    };
  }

  /* ---------- Pilotage UI ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function ready(fn) { document.readyState !== "loading" ? fn() : document.addEventListener("DOMContentLoaded", fn); }
  ready(function () {
    var form = $("#gen-form"), frame = $("#gen-frame"), stage = $("#gen-stage"), skel = $("#gen-skel"), errBox = $("#gen-err"), submitBtn = $("#gen-go"),
      deviceBtns = document.querySelectorAll("[data-device]"), redo = $("#gen-redo"), share = $("#gen-share");
    if (!form) return;
    var RM = matchMedia("(prefers-reduced-motion: reduce)").matches, origin = location.origin, lastInput = null;
    function setDevice(mode) { stage.setAttribute("data-device", mode); deviceBtns.forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-device") === mode); }); }
    deviceBtns.forEach(function (b) { b.addEventListener("click", function () { setDevice(b.getAttribute("data-device")); }); });
    function show(el, on) { if (el) el.hidden = !on; }
    async function generate(input) {
      lastInput = input; show(errBox, false); show(skel, true); show(frame, false);
      submitBtn.disabled = true; submitBtn.setAttribute("aria-busy", "true"); stage.hidden = false;
      var page = null;
      try {
        var ctrl = new AbortController(); var to = setTimeout(function () { ctrl.abort(); }, 20000);
        var r = await fetch(API + "/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal: ctrl.signal });
        clearTimeout(to);
        if (r.ok) { var j = await r.json(); if (j && j.ok && j.page) page = j.page; }
      } catch (_) {}
      if (!page) page = localCurated(input);
      page.ton = input.ton; // le ton pilote le design même si l'IA l'omet
      await new Promise(function (res) { setTimeout(res, RM ? 0 : 300); });
      frame.setAttribute("srcdoc", renderPage(page, { origin: origin }));
      show(skel, false); show(frame, true);
      submitBtn.disabled = false; submitBtn.removeAttribute("aria-busy");
      if (share) share.hidden = false; if (redo) redo.hidden = false;
      frame.dataset.source = page._source || "";
    }
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var input = { metier: $("#f-metier").value.trim(), nom: $("#f-nom").value.trim(), ville: $("#f-ville").value.trim(), ton: (form.querySelector('input[name="ton"]:checked') || {}).value || "chaleureux" };
      if (!input.metier || !input.nom) { show(errBox, true); errBox.textContent = "Indiquez au moins votre métier et le nom de votre établissement."; return; }
      generate(input);
    });
    if (redo) redo.addEventListener("click", function () { if (lastInput) generate(lastInput); });
    setDevice("desktop");
  });

  window.__flGen = { renderPage: renderPage, localCurated: localCurated, buildTheme: buildTheme };
})();
