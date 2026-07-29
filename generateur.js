/* =====================================================================
   FL — Générateur de site instantané (Chantier 1)
   ARCHÉTYPES DE COMPOSITION : chaque ton = une mise en page structurellement
   différente (ordre des sections + techniques distinctes : bento, lignes
   alternées, galerie, stats, étapes, marquee, grande citation…), par-dessus
   l'univers métier (images + accent + copy). Variation par le nom (seed).
   Rendu isolé en <iframe srcdoc>.
   ===================================================================== */
(function () {
  "use strict";
  var API = "https://main.francois-leterrier-cmw.workers.dev";

  var SECTOR_ACCENT = {
    restaurant: "#b07a2e", artisan: "#c56a1e", commerce: "#b83f76",
    "bien-etre": "#3d7150", coiffure: "#bd6a58", evenementiel: "#8f45c0", default: "#1f8fbf",
  };
  var IMG = {
    restaurant: { hero: "resto-hero", ph: "resto-cave", g: ["resto-salle", "resto-planches", "resto-terrasse", "resto-soirees"] },
    artisan: { hero: "artisan-hero", ph: "artisan-chantier", g: ["artisan-plomberie", "artisan-chauffage", "artisan-depannage", "artisan-outils"] },
    commerce: { hero: "commerce-hero", ph: "commerce-collection", g: ["commerce-accessoires", "commerce-vitrine", "commerce-mode", "commerce-detail"] },
    "bien-etre": { hero: "bienetre-hero", ph: "bienetre-nature", g: ["bienetre-seance", "bienetre-relax", "bienetre-soin", "bienetre-detail"] },
    coiffure: { hero: "coiffure-salon", ph: "coiffure-couleur", g: ["coiffure-coiffage", "coiffure-outils", "coiffure-ambiance", "coiffure-couleur"] },
    evenementiel: { hero: "fairepart-couple", ph: "fairepart-histoire", g: ["fairepart-couple", "fairepart-histoire"] },
    default: { hero: "commerce-vitrine", ph: "commerce-detail", g: ["commerce-collection", "commerce-mode", "commerce-accessoires", "commerce-vitrine"] },
  };

  var F = {
    playfair: "'Playfair Display', Georgia, serif", cormorant: "'Cormorant Garamond', Georgia, serif",
    fraunces: "'Fraunces', Georgia, serif", oswald: "'Oswald', Impact, sans-serif",
    inter: "'Inter', system-ui, sans-serif", jost: "'Jost', system-ui, sans-serif",
  };
  // Chaque ton : palette + typo + forme + ARCHÉTYPE de composition.
  var TONS = {
    chaleureux: { arch: "boutique", light: true, bg: "#f7f1e8", sf: "#fffdf9", ink: "#3a2e26", mut: "#7a6c5f", line: "rgba(58,46,38,.13)", disp: F.playfair, body: F.inter, upper: false, r: "16px", br: "30px", ls: ".14em", pad: 90, accent: "sector" },
    dynamique: { arch: "agence", light: false, bg: "#0d0d13", sf: "#191921", ink: "#f4f6fb", mut: "#9ea3b6", line: "rgba(255,255,255,.1)", disp: F.oswald, body: F.inter, upper: true, r: "2px", br: "2px", ls: ".18em", pad: 74, accent: "sector" },
    "élégant": { arch: "galerie", light: true, bg: "#f4f2ee", sf: "#fbfaf8", ink: "#2b2a27", mut: "#89867e", line: "rgba(43,42,39,.16)", disp: F.cormorant, body: F.jost, upper: false, r: "0", br: "0", ls: ".3em", pad: 116, accent: "sector" },
    rassurant: { arch: "confiance", light: true, bg: "#f3f6fb", sf: "#ffffff", ink: "#25303c", mut: "#5d6a79", line: "rgba(37,48,60,.12)", disp: F.jost, body: F.inter, upper: false, r: "14px", br: "10px", ls: ".12em", pad: 86, accent: "sector" },
    "haut de gamme": { arch: "premium", light: false, bg: "#0c0b0a", sf: "#151310", ink: "#f0ebe2", mut: "#ab9f8f", line: "rgba(201,168,106,.22)", disp: F.playfair, body: F.jost, upper: false, r: "0", br: "0", ls: ".36em", pad: 126, accent: "gold" },
  };
  // Ordre + variantes des sections par archétype (structurellement différents).
  var ARCH = {
    boutique: [["hero", "full"], ["about", "story"], ["services", "cards"], ["gallery", "strip"], ["proofs", "grid"], ["faq", ""], ["cta", ""]],
    agence: [["hero", "split"], ["stats", ""], ["services", "bento"], ["about", "split"], ["proofs", "marquee"], ["cta", ""]],
    galerie: [["hero", "clean"], ["gallery", "band"], ["services", "rows"], ["about", "center"], ["bigquote", ""], ["faq", ""], ["cta", ""]],
    confiance: [["hero", "left"], ["steps", ""], ["services", "cards"], ["trust", ""], ["proofs", "grid"], ["faq", ""], ["cta", ""]],
    premium: [["hero", "grand"], ["altrows", ""], ["signature", ""], ["about", "split"], ["gallery", "strip"], ["cta", ""]],
  };

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function rich(s) { return esc(s).replace(/&lt;em&gt;/g, "<em>").replace(/&lt;\/em&gt;/g, "</em>"); }
  function plain(s) { return String(s || "").replace(/<\/?em>/g, ""); }
  function lum(hex) { var m = hex.replace("#", ""); if (m.length === 3) m = m.split("").map(function (c) { return c + c; }).join(""); var r = parseInt(m.substr(0, 2), 16) / 255, g = parseInt(m.substr(2, 2), 16) / 255, b = parseInt(m.substr(4, 2), 16) / 255; var f = function (v) { return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); }
  function textOn(hex) { return lum(hex) > .18 ? "#151515" : "#ffffff"; }
  function seedOf(s) { var h = 0; s = String(s || ""); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
  function img(o, name) { return o + "/modeles/img/" + name + ".webp"; }

  function buildTheme(sector, ton) {
    var t = TONS[ton] || TONS.chaleureux, im = IMG[sector] || IMG.default;
    var accent = t.accent === "gold" ? "#c9a86a" : (SECTOR_ACCENT[sector] || SECTOR_ACCENT.default);
    var th = {}; for (var k in t) th[k] = t[k];
    th.accent = accent; th.on = textOn(accent); th.im = im;
    return th;
  }

  /* ---------- Renderer ---------- */
  function renderPage(page, opts) {
    opts = opts || {};
    var o = opts.origin || "", th = buildTheme(page.sector, page.ton), seed = seedOf(page.brand);
    var heroU = img(o, th.im.hero), phU = img(o, th.im.ph);
    var overlay = th.light ? "linear-gradient(180deg,rgba(255,255,255,.55),rgba(255,255,255,.88))" : "linear-gradient(160deg,rgba(0,0,0,.5),rgba(0,0,0,.84))";
    var hsh = th.light ? "0 1px 3px rgba(255,255,255,.9)" : "0 2px 22px rgba(0,0,0,.6)";
    var UP = th.upper;

    function btn(cls, label, href) { return '<a class="btn ' + cls + '" href="' + (href || "#contact") + '">' + esc(label) + "</a>"; }
    function eb(txt) { return '<div class="eb">' + esc(txt) + "</div>"; }
    function h2(t2) { return '<h2 class="st">' + esc(t2) + "</h2>"; }
    function gimg(i) { var g = th.im.g; return img(o, g[i % g.length]); }

    /* ---- HERO variants ---- */
    function hero(v) {
      var eyebrow = '<div class="eyebrow">' + esc(page.hero.eyebrow) + "</div>";
      var H1 = "<h1>" + rich(page.hero.title) + "</h1>";
      var sub = '<p class="sub">' + esc(page.hero.subtitle) + "</p>";
      var btns = '<div class="btns">' + btn("p", page.hero.ctaPrimary) + btn("s", page.hero.ctaSecondary, "#offre") + "</div>";
      if (v === "split" || v === "left") {
        var badges = v === "left" ? '<ul class="badges"><li>Devis gratuit</li><li>Sans engagement</li><li>Réponse rapide</li></ul>' : "";
        var txt = '<div class="htext"><div class="wc">' + eyebrow + H1 + sub + btns + badges + "</div></div>";
        var im = '<div class="himg" style="background-image:url(\'' + heroU + "')\"></div>";
        return '<section class="hero ' + v + '">' + (v === "left" ? txt + im : txt + im) + "</section>";
      }
      if (v === "clean")
        return '<section class="hero clean"><div class="wrap ta-c">' + eyebrow + H1 + sub + btns + '</div><div class="hband" style="background-image:url(\'' + heroU + "')\"></div></section>";
      // full / grand
      return '<section class="hero full ' + v + '" style="background-image:' + overlay + ",url('" + heroU + "')\"><div class=\"wrap ta-c\">" + eyebrow + H1 + sub + btns + "</div></section>";
    }

    /* ---- SERVICES variants ---- */
    function services(v) {
      var head = '<div class="wrap ta-c">' + eb("Nos prestations") + h2("Ce que nous proposons") + "</div>";
      if (v === "bento") {
        var cells = page.services.map(function (s, i) { return '<article class="bcell b' + i + ' reveal"><h3>' + esc(s.title) + "</h3><p>" + esc(s.desc) + "</p>" + (s.price ? '<div class="pr">' + esc(s.price) + "</div>" : "") + "</article>"; }).join("");
        return '<section class="sec offre">' + head + '<div class="wrap bento">' + cells + "</div></section>";
      }
      if (v === "rows") {
        var rows = page.services.map(function (s, i) { return '<article class="srow reveal"><span class="n">' + ("0" + (i + 1)).slice(-2) + '</span><div class="sc"><h3>' + esc(s.title) + "</h3><p>" + esc(s.desc) + "</p></div>" + (s.price ? '<span class="pr">' + esc(s.price) + "</span>" : "") + "</article>"; }).join("");
        return '<section class="sec offre">' + head + '<div class="wrap rows">' + rows + "</div></section>";
      }
      // cards (défaut)
      var cards = page.services.map(function (s) { return '<article class="card reveal"><h3>' + esc(s.title) + "</h3><p>" + esc(s.desc) + "</p>" + (s.price ? '<div class="pr">' + esc(s.price) + "</div>" : "") + "</article>"; }).join("");
      return '<section class="sec offre">' + head + '<div class="wrap grid3">' + cards + "</div></section>";
    }

    /* ---- ALTROWS (premium) : chaque prestation = grande ligne image/texte alternée ---- */
    function altrows() {
      var rows = page.services.map(function (s, i) {
        var im = '<div class="ar-im" style="background-image:url(\'' + gimg(i) + "')\"></div>";
        var tx = '<div class="ar-tx"><span class="ar-n">' + ("0" + (i + 1)).slice(-2) + "</span><h3>" + esc(s.title) + "</h3><p>" + esc(s.desc) + "</p>" + (s.price ? '<div class="pr">' + esc(s.price) + "</div>" : "") + "</div>";
        return '<div class="ar-row reveal">' + ((i + seed) % 2 ? im + tx : tx + im) + "</div>";
      }).join("");
      return '<section class="sec altrows"><div class="wrap ta-c">' + eb("Le savoir-faire") + h2("Nos prestations") + "</div>" + rows + "</section>";
    }

    /* ---- ABOUT variants ---- */
    function about(v) {
      var body = "<h2>" + esc(page.about.title) + "</h2><p>" + esc(page.about.body) + "</p>";
      if (v === "center")
        return '<section class="sec about-c"><div class="wrap ta-c reveal"><div class="eb">Notre maison</div>' + body + "</div></section>";
      if (v === "story")
        return '<section class="sec about-story"><div class="wrap ag reveal"><div class="im" style="background-image:url(\'' + phU + '\')"></div><div class="tx">' + eb("Notre histoire") + body + "</div></div></section>";
      // split
      var left = (seed % 2 === 0);
      var imh = '<div class="im" style="background-image:url(\'' + phU + '\')"></div>';
      var txh = '<div class="tx">' + eb("À propos") + body + "</div>";
      return '<section class="sec about-split"><div class="wrap ag reveal">' + (left ? imh + txh : txh + imh) + "</div></section>";
    }

    /* ---- GALLERY ---- */
    function gallery(v) {
      var g = th.im.g, n = Math.min(g.length, v === "band" ? 3 : 4);
      var tiles = "";
      for (var i = 0; i < n; i++) tiles += '<div class="gt" style="background-image:url(\'' + gimg(i + (seed % g.length)) + "')\"></div>";
      if (v === "band") return '<section class="gallery band reveal">' + tiles + "</section>";
      return '<section class="sec"><div class="wrap ta-c">' + eb("En images") + '</div><div class="wrap gstrip reveal">' + tiles + "</div></section>";
    }

    /* ---- STATS (agence) ---- */
    function stats() {
      var v = th.im; var items = [["Sur-mesure", "Composé pour vous, jamais un modèle recopié"], ["Sans engagement", "On avance à votre rythme"], ["Réactif", "Un interlocuteur unique, une réponse rapide"], ["Local", "Proche de vous, à " + esc(page.contact.ville)]];
      var cells = items.map(function (it) { return '<div class="stat reveal"><div class="v">' + it[0] + '</div><div class="l">' + it[1] + "</div></div>"; }).join("");
      return '<section class="sec statsband"><div class="wrap stats">' + cells + "</div></section>";
    }

    /* ---- STEPS (confiance) ---- */
    function steps() {
      var st = [["01", "On échange", "On comprend votre activité et vos objectifs — premier échange offert."], ["02", "On conçoit", "Une proposition sur-mesure, adaptée à votre budget."], ["03", "On réalise", "On livre, on ajuste, et on vous rend autonome."]];
      var cells = st.map(function (s) { return '<article class="step reveal"><span class="sn">' + s[0] + "</span><h3>" + s[1] + "</h3><p>" + s[2] + "</p></article>"; }).join("");
      return '<section class="sec"><div class="wrap ta-c">' + eb("Comment ça se passe") + h2("Simple, du début à la fin") + '</div><div class="wrap steps">' + cells + "</div></section>";
    }

    /* ---- TRUST band (confiance) ---- */
    function trust() {
      var b = ["Devis gratuit", "Sans engagement", "Réponse rapide", "Travail garanti", "Interlocuteur unique"];
      return '<section class="trustband"><div class="wrap trust reveal">' + b.map(function (x) { return "<span>" + x + "</span>"; }).join("") + "</div></section>";
    }

    /* ---- PROOFS variants ---- */
    function proofs(v) {
      if (v === "marquee") {
        var loop = page.proofs.concat(page.proofs).map(function (p) { return '<figure class="mq"><blockquote>' + esc(p.quote) + "</blockquote><figcaption>— " + esc(p.author) + "</figcaption></figure>"; }).join("");
        return '<section class="sec proofs"><div class="wrap ta-c">' + eb("Ils en parlent") + h2("Vos avis") + '</div><div class="marquee"><div class="mtrack">' + loop + "</div></div></section>";
      }
      var cards = page.proofs.map(function (p) { return '<figure class="t"><blockquote>' + esc(p.quote) + "</blockquote><figcaption>— " + esc(p.author) + "</figcaption></figure>"; }).join("");
      return '<section class="sec proofs"><div class="wrap ta-c">' + eb("Ils en parlent") + h2("Vos avis") + '</div><div class="wrap tg reveal">' + cards + "</div></section>";
    }

    /* ---- BIG QUOTE (galerie) ---- */
    function bigquote() {
      var p = page.proofs[0] || { quote: "", author: "" };
      return '<section class="sec bigq"><div class="wrap ta-c reveal"><blockquote>“ ' + esc(p.quote) + ' ”</blockquote><cite>— ' + esc(p.author) + "</cite></div></section>";
    }

    /* ---- SIGNATURE (premium) : manifeste centré ---- */
    var SIGN = { restaurant: "La table où l'on prend le temps.", artisan: "Le travail bien fait, sans compromis.", commerce: "Le beau, choisi avec soin.", "bien-etre": "Un temps pour soi, enfin.", coiffure: "Votre style, révélé.", evenementiel: "L'émotion, jusque dans le détail.", default: "L'exigence dans chaque détail." };
    function signature() {
      var line = SIGN[page.sector] || SIGN.default;
      return '<section class="sec sign"><div class="wrap ta-c reveal"><div class="eb">' + esc(page.brand) + '</div><p class="sg">' + esc(line) + "</p></div></section>";
    }

    function faq() {
      var items = page.faq.map(function (f) { return "<details><summary>" + esc(f.q) + "</summary><p>" + esc(f.a) + "</p></details>"; }).join("");
      return '<section class="sec"><div class="wrap ta-c">' + eb("Questions fréquentes") + h2("Bon à savoir") + '</div><div class="wrap faq reveal">' + items + "</section>";
    }
    function cta() {
      return '<section id="contact" class="sec ctaband"><div class="wrap ta-c"><h2>' + esc(page.cta.title) + "</h2><p>" + esc(page.cta.subtitle) + '</p><div class="btns ctr">' + btn("p", page.cta.button) + "</div></div></section>";
    }

    var R = { hero: hero, services: services, altrows: altrows, about: about, gallery: gallery, stats: stats, steps: steps, trust: trust, proofs: proofs, bigquote: bigquote, signature: signature, faq: faq, cta: cta };
    var flow = ARCH[th.arch] || ARCH.boutique;
    var nav = '<header class="nav"><span class="brand">' + esc(page.brand) + '</span><a class="cta" href="#contact">' + esc(page.cta.button) + "</a></header>";
    var body = nav + flow.map(function (sec) { var fn = R[sec[0]]; return fn ? fn(sec[1]) : ""; }).join("");

    /* ---------- CSS ---------- */
    var pad = th.pad;
    var css =
      ":root{--bg:" + th.bg + ";--sf:" + th.sf + ";--ink:" + th.ink + ";--mut:" + th.mut + ";--ac:" + th.accent + ";--on:" + th.on + ";--ln:" + th.line + ";--r:" + th.r + ";--br:" + th.br + ";--hsh:" + hsh + "}" +
      "*{box-sizing:border-box;margin:0;padding:0}html{scroll-behavior:smooth}body{font-family:" + th.body + ";background:var(--bg);color:var(--ink);line-height:1.62;-webkit-font-smoothing:antialiased}" +
      "h1,h2,h3{font-family:" + th.disp + ";font-weight:600;line-height:1.08;letter-spacing:-.01em}" + (UP ? "h1,h2,h3{text-transform:uppercase;letter-spacing:.01em}" : "") +
      ".wrap{max-width:1120px;margin:0 auto;padding:0 26px}.wc{max-width:520px}.ta-c{text-align:center}" +
      ".eb,.eyebrow{font-family:" + th.body + ";font-size:12px;font-weight:700;letter-spacing:" + th.ls + ";text-transform:uppercase;color:var(--ac)}.eb{margin-bottom:10px}" +
      ".st{font-size:clamp(28px,5vw,46px);margin:6px 0 44px}" +
      ".sec{padding:" + pad + "px 0}" +
      /* nav */
      "header.nav{position:sticky;top:0;z-index:6;display:flex;align-items:center;justify-content:space-between;padding:15px 26px;background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(10px);border-bottom:1px solid var(--ln)}.brand{font-family:" + th.disp + ";font-size:21px;font-weight:600}" +
      ".nav .cta{font-family:" + th.body + ";font-size:12.5px;font-weight:700;color:var(--on);background:var(--ac);padding:10px 18px;border-radius:var(--br);text-decoration:none;text-transform:" + (UP ? "uppercase" : "none") + ";letter-spacing:" + (UP ? ".08em" : "0") + "}" +
      /* boutons */
      ".btn{font-family:" + th.body + ";font-size:14.5px;font-weight:700;padding:15px 30px;border-radius:var(--br);text-decoration:none;display:inline-block;border:1.5px solid var(--ac);text-transform:" + (UP ? "uppercase" : "none") + ";letter-spacing:" + (UP ? ".08em" : "0") + "}.btn.p{background:var(--ac);color:var(--on)}.btn.s{background:transparent;color:var(--ink);border-color:var(--ln)}.btns{display:flex;gap:13px;flex-wrap:wrap}.btns.ctr{justify-content:center}" +
      /* HERO */
      ".hero .eyebrow{margin-bottom:16px;text-shadow:var(--hsh)}.hero h1{font-size:clamp(38px,8vw,82px);margin:0 0 20px}.hero h1 em{font-style:italic;color:var(--ac)}.hero .sub{font-size:clamp(16px,2.3vw,20px);color:var(--ink);opacity:.94;margin:0 0 30px;max-width:600px}" +
      ".hero.full{min-height:76vh;display:flex;align-items:center;padding:90px 0;background-size:cover;background-position:center}.hero.full .wrap>*{text-shadow:var(--hsh)}.hero.full .sub{margin:0 auto 30px}.hero.full .btns{justify-content:center}" +
      ".hero.grand{min-height:90vh}.hero.grand h1{font-weight:500;letter-spacing:.02em;font-size:clamp(40px,7vw,78px)}.hero.grand .eyebrow{letter-spacing:.42em}" +
      ".hero.split,.hero.left{display:grid;grid-template-columns:1fr 1fr;min-height:76vh}.hero.split .htext,.hero.left .htext{display:flex;align-items:center;padding:56px 26px;background:var(--bg)}.hero.left .htext{justify-content:flex-end}.hero .wc{width:100%}.hero .himg{background-size:cover;background-position:center;min-height:340px}" +
      ".badges{list-style:none;display:flex;flex-wrap:wrap;gap:9px;margin-top:22px}.badges li{font-size:12.5px;font-weight:600;background:color-mix(in srgb,var(--ac) 14%,transparent);border:1px solid var(--ln);padding:6px 13px;border-radius:20px}.badges li::before{content:'✓ ';color:var(--ac);font-weight:800}" +
      ".hero.clean{padding:104px 0 0;text-align:center}.hero.clean .sub{margin:0 auto 30px}.hero.clean .btns{justify-content:center}.hero.clean h1{text-shadow:var(--hsh)}.hero.clean .hband{margin-top:64px;height:46vh;min-height:320px;background-size:cover;background-position:center}" +
      /* offre : cards */
      ".grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:22px}.card{background:var(--sf);border:1px solid var(--ln);border-radius:calc(var(--r) + 8px);padding:30px;box-shadow:0 18px 40px -30px rgba(0,0,0,.5)}.card h3{font-size:21px;margin-bottom:10px}.card p{color:var(--mut);font-size:15px}.pr{font-family:" + th.disp + ";font-size:19px;color:var(--ac);margin-top:14px}" +
      /* bento */
      ".bento{display:grid;grid-template-columns:repeat(3,1fr);grid-auto-rows:1fr;gap:16px}.bcell{background:var(--sf);border:1px solid var(--ln);border-radius:2px;padding:28px;position:relative;overflow:hidden}.bcell::before{content:'';position:absolute;inset:0 auto auto 0;width:100%;height:4px;background:var(--ac)}.bcell h3{font-size:20px;margin:6px 0 8px}.bcell p{color:var(--mut);font-size:14.5px}.bcell.b0{grid-column:span 2;grid-row:span 2;background:color-mix(in srgb,var(--ac) 12%,var(--sf))}.bcell.b0 h3{font-size:30px}" +
      /* rows (galerie) */
      ".rows{max-width:900px}.srow{display:flex;align-items:baseline;gap:26px;padding:30px 0;border-top:1px solid var(--ln)}.srow .n{font-family:" + th.disp + ";font-size:26px;color:var(--ac);opacity:.7;min-width:44px}.srow .sc{flex:1}.srow h3{font-size:24px;margin-bottom:6px}.srow p{color:var(--mut);font-size:15.5px}.srow .pr{margin:0}" +
      /* altrows (premium) */
      ".altrows .ar-row{display:grid;grid-template-columns:1fr 1fr;min-height:56vh;align-items:stretch}.ar-im{background-size:cover;background-position:center;min-height:300px}.ar-tx{display:flex;flex-direction:column;justify-content:center;padding:60px 8vw;background:var(--sf)}.ar-n{font-family:" + th.disp + ";font-size:22px;color:var(--ac);letter-spacing:.3em}.ar-tx h3{font-size:clamp(26px,4vw,40px);margin:10px 0 14px}.ar-tx p{color:var(--mut);font-size:17px}" +
      /* about */
      ".ag{display:grid;grid-template-columns:1fr 1fr;gap:52px;align-items:center}.about-split .im,.about-story .im{aspect-ratio:4/3;background-size:cover;background-position:center;border-radius:var(--r)}.ag h2{font-size:clamp(26px,4vw,40px);margin:8px 0 16px}.ag p{color:var(--mut);font-size:17px}.about-c h2{font-size:clamp(30px,5vw,52px);max-width:14ch;margin:10px auto 0;line-height:1.12}.about-c .wrap{max-width:820px}" +
      /* gallery */
      ".gallery.band{display:grid;grid-template-columns:repeat(3,1fr);gap:0}.gallery.band .gt{aspect-ratio:1;background-size:cover;background-position:center}.gstrip{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}.gstrip .gt{aspect-ratio:3/4;background-size:cover;background-position:center;border-radius:var(--r)}" +
      /* stats */
      ".statsband{background:var(--sf);border-top:1px solid var(--ln);border-bottom:1px solid var(--ln)}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:24px}.stat .v{font-family:" + th.disp + ";font-size:clamp(22px,3vw,30px);color:var(--ac);text-transform:uppercase;letter-spacing:.04em}.stat .l{color:var(--mut);font-size:14px;margin-top:8px}" +
      /* steps */
      ".steps{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}.step{padding:8px 4px}.sn{font-family:" + th.disp + ";font-size:40px;color:var(--ac);opacity:.5}.step h3{font-size:22px;margin:6px 0 8px}.step p{color:var(--mut);font-size:15px}" +
      /* trust */
      ".trustband{background:var(--ac);color:var(--on);padding:20px 0}.trust{display:flex;flex-wrap:wrap;justify-content:center;gap:10px 34px;text-align:center}.trust span{font-weight:700;font-size:14px}.trust span::before{content:'✓ '}" +
      /* proofs */
      ".proofs{background:var(--sf);border-top:1px solid var(--ln);border-bottom:1px solid var(--ln)}.tg{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}.t{background:var(--bg);border:1px solid var(--ln);border-radius:var(--r);padding:26px}.t blockquote{font-size:15px;font-style:" + (UP ? "normal" : "italic") + "}.t figcaption{margin-top:14px;font-size:13px;color:var(--mut)}" +
      ".marquee{overflow:hidden;-webkit-mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent);mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent)}.mtrack{display:flex;gap:18px;width:max-content;animation:mq 34s linear infinite}.mq{flex:0 0 340px;background:var(--bg);border:1px solid var(--ln);border-radius:var(--r);padding:22px}.mq blockquote{font-size:14.5px;font-style:italic}.mq figcaption{margin-top:12px;font-size:12.5px;color:var(--mut)}@keyframes mq{to{transform:translateX(-50%)}}" +
      /* bigquote / signature */
      ".bigq blockquote{font-family:" + th.disp + ";font-size:clamp(26px,4.4vw,44px);line-height:1.25;max-width:16ch;margin:0 auto}.bigq cite{display:block;margin-top:22px;color:var(--mut);font-style:normal;font-size:15px}" +
      ".sign{border-top:1px solid var(--ln);border-bottom:1px solid var(--ln)}.sign .sg{font-family:" + th.disp + ";font-size:clamp(26px,4.6vw,46px);line-height:1.2;max-width:18ch;margin:12px auto 0}" +
      /* faq */
      ".faq{max-width:760px}details{border-bottom:1px solid var(--ln);padding:18px 4px}summary{cursor:pointer;font-family:" + th.disp + ";font-size:" + (UP ? "17px" : "20px") + ";list-style:none}summary::-webkit-details-marker{display:none}details p{color:var(--mut);margin-top:10px}" +
      /* cta / footer */
      ".ctaband{text-align:center;background:radial-gradient(120% 100% at 50% 0%,color-mix(in srgb,var(--ac) 18%,transparent),transparent 60%)}.ctaband h2{font-size:clamp(30px,6vw,54px)}.ctaband p{color:var(--mut);margin:14px 0 28px;font-size:18px}" +
      /* reveal */
      ".reveal{transition:opacity .6s ease,transform .6s ease}.js .reveal{opacity:0;transform:translateY(18px)}.js .reveal.in{opacity:1;transform:none}" +
      "@media(prefers-reduced-motion:reduce){.js .reveal{opacity:1!important;transform:none!important;transition:none}.mtrack{animation:none}html{scroll-behavior:auto}}" +
      /* responsive */
      "@media(max-width:860px){.hero.split,.hero.left{grid-template-columns:1fr}.hero .himg{min-height:250px;order:-1}.hero.left .htext{justify-content:flex-start}.grid3,.tg,.ag,.steps,.stats,.gstrip{grid-template-columns:1fr}.bento{grid-template-columns:1fr}.bcell.b0{grid-column:auto;grid-row:auto}.gallery.band{grid-template-columns:1fr}.altrows .ar-row{grid-template-columns:1fr}.ar-im{order:-1}.ag>.im{order:-1}.stats{grid-template-columns:1fr 1fr}}";

    var reveal = '<script>(function(){var e=document.querySelectorAll(".reveal");if(!("IntersectionObserver" in window)){e.forEach(function(x){x.classList.add("in")});return}var o=new IntersectionObserver(function(t){t.forEach(function(x){if(x.isIntersecting){x.target.classList.add("in");o.unobserve(x.target)}})},{threshold:.1});e.forEach(function(x){o.observe(x)})})();<\/script>';

    return "<!doctype html><html lang=\"fr\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
      "<script>document.documentElement.className='js'<\/script>" + (o ? '<base href="' + o + '/">' : "") +
      '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,600&family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Inter:wght@400;600;700&family=Jost:wght@400;500;600&family=Oswald:wght@500;600&family=Playfair+Display:ital,wght@0,500;0,600;1,600&display=swap">' +
      "<title>" + esc(page.brand) + "</title><style>" + css + "</style></head><body>" + body + reveal + "</body></html>";
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
    var packs = { restaurant: { eb: "Bar à vin · Cuisine de partage", t: "Le goût du <em>partage</em>", sub: "Une cave vivante, une cuisine franche, des soirées qui s'étirent." }, artisan: { eb: "Intervention rapide · Devis gratuit", t: "Un travail <em>bien fait</em>", sub: "On intervient vite, avec des tarifs annoncés d'avance et une garantie." }, commerce: { eb: "Boutique · Conseil personnalisé", t: "Des pièces qu'on <em>aime porter</em>", sub: "Une sélection pointue et un accueil qui prend le temps." }, "bien-etre": { eb: "Accompagnement · Bien-être", t: "Reprenez votre <em>souffle</em>", sub: "Un espace calme pour relâcher la pression et retrouver de l'énergie." }, coiffure: { eb: "Coiffure · Coloriste", t: "Votre style, <em>sublimé</em>", sub: "Une coupe pensée pour vous et un moment rien qu'à vous." }, evenementiel: { eb: "Événementiel · Sur-mesure", t: "Des moments <em>inoubliables</em>", sub: "On imagine et orchestre vos plus beaux événements." }, default: { eb: "Votre établissement", t: "Bienvenue chez <em>nous</em>", sub: "Un savoir-faire à votre service, avec exigence et proximité." } };
    var p = packs[s] || packs.default;
    var names = ({ restaurant: ["La carte", "La cave", "Privatisation"], artisan: ["Dépannage", "Rénovation", "Entretien"], commerce: ["La sélection", "Conseil en style", "Click & Collect"], "bien-etre": ["Séance individuelle", "Gestion du stress", "Séances en groupe"], coiffure: ["Coupe & coiffage", "Couleur", "Soins"], evenementiel: ["Mariages", "Événements pros", "Coordination"], default: ["Savoir-faire", "Accompagnement", "Proximité"] })[s] || ["Savoir-faire", "Accompagnement", "Proximité"];
    return { brand: n, sector: s, ton: input.ton || "chaleureux", ville: v, hero: { eyebrow: p.eb + " · " + v, title: p.t, subtitle: n + " — " + p.sub, ctaPrimary: "Nous contacter", ctaSecondary: "En savoir plus" }, services: names.map(function (nm) { return { title: nm, desc: "Un service pensé pour vous, avec le souci du détail.", price: "" }; }), about: { title: "Qui sommes-nous", body: n + ", à " + v + ", c'est l'exigence du travail bien fait et le goût du contact." }, proofs: [{ quote: "Sérieux, à l'écoute, efficace. Je recommande vivement.", author: "Client satisfait" }, { quote: "Un accompagnement de qualité du début à la fin.", author: "Cliente fidèle" }, { quote: "Professionnalisme et proximité. Rien à redire.", author: "Client local" }], faq: [{ q: "Comment vous contacter ?", a: "Par téléphone ou via le formulaire — réponse rapide." }, { q: "Où êtes-vous situés ?", a: "À " + v + " et alentour." }, { q: "Un premier échange ?", a: "Oui, sans engagement." }], cta: { title: "Contactez-nous", subtitle: "On sera ravis d'échanger.", button: "Nous contacter" }, contact: { ville: v, phone: "", hours: "Sur rendez-vous" }, _source: "local" };
  }

  /* ---------- UI ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function ready(fn) { document.readyState !== "loading" ? fn() : document.addEventListener("DOMContentLoaded", fn); }
  ready(function () {
    var form = $("#gen-form"), frame = $("#gen-frame"), stage = $("#gen-stage"), skel = $("#gen-skel"), errBox = $("#gen-err"), submitBtn = $("#gen-go"), deviceBtns = document.querySelectorAll("[data-device]"), redo = $("#gen-redo"), share = $("#gen-share");
    if (!form) return;
    var RM = matchMedia("(prefers-reduced-motion: reduce)").matches, origin = location.origin, lastInput = null;
    function setDevice(m) { stage.setAttribute("data-device", m); deviceBtns.forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-device") === m); }); }
    deviceBtns.forEach(function (b) { b.addEventListener("click", function () { setDevice(b.getAttribute("data-device")); }); });
    function show(el, on) { if (el) el.hidden = !on; }
    async function generate(input) {
      lastInput = input; show(errBox, false); show(skel, true); show(frame, false); submitBtn.disabled = true; submitBtn.setAttribute("aria-busy", "true"); stage.hidden = false;
      var page = null;
      try { var ctrl = new AbortController(); var to = setTimeout(function () { ctrl.abort(); }, 20000); var r = await fetch(API + "/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal: ctrl.signal }); clearTimeout(to); if (r.ok) { var j = await r.json(); if (j && j.ok && j.page) page = j.page; } } catch (_) {}
      if (!page) page = localCurated(input);
      page.ton = input.ton;
      await new Promise(function (res) { setTimeout(res, RM ? 0 : 300); });
      frame.setAttribute("srcdoc", renderPage(page, { origin: origin }));
      show(skel, false); show(frame, true); submitBtn.disabled = false; submitBtn.removeAttribute("aria-busy");
      if (share) share.hidden = false; if (redo) redo.hidden = false; frame.dataset.source = page._source || "";
    }
    form.addEventListener("submit", function (e) { e.preventDefault(); var input = { metier: $("#f-metier").value.trim(), nom: $("#f-nom").value.trim(), ville: $("#f-ville").value.trim(), ton: (form.querySelector('input[name="ton"]:checked') || {}).value || "chaleureux" }; if (!input.metier || !input.nom) { show(errBox, true); errBox.textContent = "Indiquez au moins votre métier et le nom de votre établissement."; return; } generate(input); });
    if (redo) redo.addEventListener("click", function () { if (lastInput) generate(lastInput); });
    setDevice("desktop");
  });
  window.__flGen = { renderPage: renderPage, localCurated: localCurated, buildTheme: buildTheme };
})();
