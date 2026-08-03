/* =====================================================================
   FL — Blog « nouvelle génération » : couche d'expérience de lecture + IA.
   Front only, sans dépendance. À inclure en fin de body des articles :
   <script src="/blog-ng.js" defer></script>
   Fonctions : barre de progression, sommaire auto + scroll-spy (rail à
   gauche sur desktop / overlay sur mobile), réglages de lecture (taille,
   focus), lecture vocale (« Écouter »), mini-chat IA ancré sur l'article,
   et réactions (KV). Respecte prefers-reduced-motion et le clavier.
   ===================================================================== */
(function () {
  "use strict";
  if (window.__flBlogNG) return; window.__flBlogNG = true;
  var article = document.querySelector("article .wrap") || document.querySelector("article");
  if (!article) return; // pas une page article
  var API = "https://main.francois-leterrier-cmw.workers.dev";
  var RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var slug = (location.pathname.split("/").pop() || "").replace(".html", "") || "article";
  var openToc = null; // défini si un sommaire est construit

  function el(tag, attrs, html) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  /* ---------- styles ---------- */
  var css = ''
    + '#flng-prog{position:fixed;top:0;left:0;height:3px;width:0;z-index:120;background:linear-gradient(90deg,#28c8dd,#7c3aed,#e05bc8);box-shadow:0 0 10px rgba(124,58,237,.6);transition:width .1s linear}'
    + '#flng-rail{position:fixed;left:max(18px,calc(50vw - 640px));top:120px;width:210px;z-index:60;display:none}'
    + '@media(min-width:1180px){#flng-rail{display:block}}'
    + '#flng-rail .flng-toc-h{font:600 11px/1.2 Montserrat,system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#8fe6f0;margin:0 0 10px 12px}'
    + '#flng-rail a{display:block;padding:4px 0 4px 14px;margin:1px 0;border-left:2px solid rgba(143,230,240,.18);color:#b9b3c6;font:500 13px/1.35 Montserrat,system-ui,sans-serif;text-decoration:none;transition:.15s;cursor:pointer}'
    + '#flng-rail a:hover{color:#e7e2f0;border-color:rgba(143,230,240,.5)}'
    + '#flng-rail a.on{color:#fff;border-color:#28c8dd;font-weight:600}'
    + '#flng-rail a.sub{padding-left:26px;font-size:12px}'
    + '.flng-tools{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:14px 0 24px;padding:10px 12px;border:1px solid rgba(143,230,240,.16);border-radius:14px;background:rgba(255,255,255,.03)}'
    + '.flng-tools button{cursor:pointer;border:1px solid rgba(143,230,240,.24);background:rgba(255,255,255,.04);color:#e7e2f0;font:600 13px/1 Montserrat,system-ui,sans-serif;padding:8px 12px;border-radius:20px;display:inline-flex;align-items:center;gap:7px;transition:.15s}'
    + '.flng-tools button:hover{border-color:#28c8dd;color:#fff;background:rgba(40,200,221,.1)}'
    + '.flng-tools button[aria-pressed="true"]{background:linear-gradient(90deg,#28c8dd,#7c3aed);color:#08111f;border-color:transparent}'
    + '.flng-tools .flng-sz{display:inline-flex;align-items:center;gap:4px;margin-left:auto}'
    + '.flng-tools svg{width:16px;height:16px;flex:none}'
    + 'html.flng-focus body>*:not(#flng-prog){filter:saturate(.85)}'
    + 'html.flng-focus article .wrap{background:rgba(0,0,0,.0)}'
    + 'article .wrap{font-size:calc(1rem * var(--flng-scale,1))}'
    + '.flng-reading b,.flng-reading strong{color:#fff}'
    + '.flng-eng{margin:34px 0 8px;padding:20px;border:1px solid rgba(143,230,240,.2);border-radius:18px;background:linear-gradient(180deg,rgba(124,58,237,.10),rgba(6,7,14,.2))}'
    + '.flng-eng h3{margin:0 0 4px;font-family:Fraunces,Georgia,serif;font-size:20px;color:#fff}'
    + '.flng-eng .flng-sub{margin:0 0 14px;color:#b9b3c6;font-size:13.5px}'
    + '.flng-chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}'
    + '.flng-chip{cursor:pointer;border:1px solid rgba(143,230,240,.28);background:rgba(255,255,255,.04);color:#e7e2f0;font:600 12.5px Montserrat,system-ui,sans-serif;padding:7px 12px;border-radius:20px;transition:.15s}'
    + '.flng-chip:hover{border-color:#28c8dd;color:#fff;background:rgba(40,200,221,.1)}'
    + '.flng-ask{display:flex;gap:8px}'
    + '.flng-ask input{flex:1;min-width:0;background:rgba(255,255,255,.05);border:1px solid rgba(143,230,240,.24);border-radius:24px;padding:11px 15px;color:#f2ecf4;font:inherit;font-size:14px}'
    + '.flng-ask input:focus{outline:none;border-color:#28c8dd;box-shadow:0 0 0 3px rgba(40,200,221,.16)}'
    + '.flng-ask button{flex:none;border:0;border-radius:24px;padding:0 18px;cursor:pointer;font:800 14px Montserrat,system-ui,sans-serif;color:#08111f;background:linear-gradient(90deg,#28c8dd,#7c3aed,#e05bc8)}'
    + '.flng-ask button[disabled]{opacity:.6;cursor:progress}'
    + '.flng-ans{margin-top:14px;padding:14px 16px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(143,230,240,.16);color:#e7e2f0;font-size:14px;line-height:1.6;display:none}'
    + '.flng-ans.show{display:block}'
    + '.flng-ans .flng-q{color:#8fe6f0;font-weight:700;margin-bottom:6px}'
    + '.flng-ans small{display:block;margin-top:10px;color:#8f8aa0;font-size:11.5px}'
    + '.flng-react{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:16px}'
    + '.flng-react .lbl{color:#b9b3c6;font-size:13px;margin-right:2px}'
    + '.flng-react button{cursor:pointer;border:1px solid rgba(143,230,240,.24);background:rgba(255,255,255,.04);color:#e7e2f0;font:600 13px Montserrat,system-ui,sans-serif;padding:7px 12px;border-radius:20px;display:inline-flex;gap:7px;align-items:center;transition:.15s}'
    + '.flng-react button:hover{border-color:#28c8dd;background:rgba(40,200,221,.1)}'
    + '.flng-react button.done{border-color:#28c8dd;background:rgba(40,200,221,.14);cursor:default}'
    + '.flng-react .ct{color:#8fe6f0;font-variant-numeric:tabular-nums}'
    + '@media(min-width:1180px){.flng-tools .flng-somm-btn{display:none}}'
    + '#flng-ov{position:fixed;inset:0;z-index:130;background:rgba(4,4,10,.72);backdrop-filter:blur(4px);display:none;align-items:flex-end}'
    + '#flng-ov.show{display:flex}'
    + '#flng-ov .bx{width:100%;max-height:74vh;overflow:auto;background:#0d0a1c;border-top-left-radius:20px;border-top-right-radius:20px;border-top:1px solid rgba(143,230,240,.2);padding:18px 20px 30px}'
    + '#flng-ov h4{margin:0 0 12px;color:#8fe6f0;font:600 12px Montserrat;letter-spacing:.12em;text-transform:uppercase}'
    + '#flng-ov a{display:block;padding:10px 4px;border-bottom:1px solid rgba(143,230,240,.1);color:#e7e2f0;text-decoration:none;font-size:15px}'
    + '#flng-ov a.on{color:#28c8dd}'
    + (RM ? '' : '#flng-eng-reveal{opacity:0;transform:translateY(12px);transition:opacity .5s,transform .5s}#flng-eng-reveal.in{opacity:1;transform:none}');
  document.head.appendChild(el("style", { id: "flng-css" }, css));

  /* ---------- 1. barre de progression ---------- */
  var prog = el("div", { id: "flng-prog", "aria-hidden": "true" });
  document.body.appendChild(prog);
  var ticking = false;
  function onScroll() {
    if (ticking) return; ticking = true;
    requestAnimationFrame(function () {
      var r = article.getBoundingClientRect();
      var total = r.height - window.innerHeight;
      var done = Math.min(1, Math.max(0, (-r.top) / (total > 0 ? total : 1)));
      prog.style.width = (done * 100).toFixed(1) + "%";
      ticking = false;
    });
  }
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", onScroll, { passive: true });

  /* ---------- 2. sommaire (TOC) + scroll-spy ---------- */
  var heads = [].slice.call(article.querySelectorAll("h2, h3")).filter(function (h) { return h.textContent.trim(); });
  var railLinks = [];
  if (heads.length >= 3) {
    heads.forEach(function (h, i) { if (!h.id) h.id = "s-" + slug.slice(0, 6) + "-" + i; });
    var rail = el("nav", { id: "flng-rail", "aria-label": "Sommaire de l'article" });
    rail.appendChild(el("p", { "class": "flng-toc-h" }, "Sommaire"));
    var ovBox = el("div", { "class": "bx" });
    ovBox.appendChild(el("h4", null, "Sommaire"));
    heads.forEach(function (h) {
      var a = el("a", { href: "#" + h.id, "class": h.tagName === "H3" ? "sub" : "" }, esc(h.textContent));
      a.addEventListener("click", function (e) { e.preventDefault(); h.scrollIntoView({ behavior: RM ? "auto" : "smooth", block: "start" }); closeOv(); });
      rail.appendChild(a); railLinks.push(a);
      var a2 = el("a", { href: "#" + h.id, "class": h.tagName === "H3" ? "sub" : "" }, esc(h.textContent));
      a2.dataset.for = h.id;
      a2.addEventListener("click", function (e) { e.preventDefault(); h.scrollIntoView({ behavior: RM ? "auto" : "smooth", block: "start" }); closeOv(); });
      ovBox.appendChild(a2);
    });
    document.body.appendChild(rail);
    // overlay (déclenché depuis la barre d'outils sur mobile/tablette)
    var ov = el("div", { id: "flng-ov", role: "dialog", "aria-label": "Sommaire" });
    ov.appendChild(ovBox);
    document.body.appendChild(ov);
    function closeOv() { ov.classList.remove("show"); }
    openToc = function () { ov.classList.add("show"); };
    ov.addEventListener("click", function (e) { if (e.target === ov) closeOv(); });
    // scroll-spy
    var byId = {};
    railLinks.forEach(function (a) { byId[a.getAttribute("href").slice(1)] = a; });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          railLinks.forEach(function (a) { a.classList.remove("on"); });
          [].forEach.call(ovBox.children, function (c) { c.classList && c.classList.remove("on"); });
          var id = en.target.id, a = byId[id];
          if (a) a.classList.add("on");
          var a2 = ovBox.querySelector('[data-for="' + id + '"]'); if (a2) a2.classList.add("on");
        }
      });
    }, { rootMargin: "-15% 0px -70% 0px" });
    heads.forEach(function (h) { io.observe(h); });
  }

  /* ---------- 3. réglages de lecture + écouter ---------- */
  var SZKEY = "flng-scale";
  var scale = parseFloat(localStorage.getItem(SZKEY) || "1") || 1;
  function applyScale() { article.style.setProperty("--flng-scale", scale); }
  applyScale();
  var tools = el("div", { "class": "flng-tools", role: "toolbar", "aria-label": "Options de lecture" });
  var listenBtn = null;
  var ttsOk = "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
  if (ttsOk) {
    listenBtn = el("button", { type: "button", "aria-pressed": "false" }, '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a9 9 0 0 1 0 14"/></svg><span>Écouter</span>');
    tools.appendChild(listenBtn);
  }
  var focusBtn = el("button", { type: "button", "aria-pressed": "false" }, '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2"/></svg><span>Focus</span>');
  tools.appendChild(focusBtn);
  var szWrap = el("div", { "class": "flng-sz" });
  var minus = el("button", { type: "button", "aria-label": "Réduire la taille du texte" }, "A−");
  var plus = el("button", { type: "button", "aria-label": "Augmenter la taille du texte" }, "A+");
  szWrap.appendChild(minus); szWrap.appendChild(plus); tools.appendChild(szWrap);
  // bouton « Sommaire » dans la barre (mobile/tablette uniquement — le rail gauche prend le relais sur desktop)
  if (openToc) {
    var sBtn = el("button", { type: "button", "class": "flng-somm-btn", "aria-label": "Ouvrir le sommaire" }, '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="14" y2="17"/></svg><span>Sommaire</span>');
    sBtn.addEventListener("click", openToc);
    tools.insertBefore(sBtn, tools.firstChild);
  }
  // insert toolbar right after the hero meta / at top of article content
  article.insertBefore(tools, article.firstChild);

  minus.addEventListener("click", function () { scale = Math.max(0.9, Math.round((scale - 0.1) * 10) / 10); localStorage.setItem(SZKEY, scale); applyScale(); });
  plus.addEventListener("click", function () { scale = Math.min(1.4, Math.round((scale + 0.1) * 10) / 10); localStorage.setItem(SZKEY, scale); applyScale(); });
  focusBtn.addEventListener("click", function () {
    var on = document.documentElement.classList.toggle("flng-focus");
    focusBtn.setAttribute("aria-pressed", on ? "true" : "false");
  });

  if (listenBtn) {
    var speaking = false;
    function stopTTS() { try { speechSynthesis.cancel(); } catch (_) {} speaking = false; listenBtn.setAttribute("aria-pressed", "false"); listenBtn.querySelector("span").textContent = "Écouter"; }
    listenBtn.addEventListener("click", function () {
      if (speaking) { stopTTS(); return; }
      var txt = "";
      [].forEach.call(article.querySelectorAll("h1, h2, h3, p, li"), function (n) {
        if (n.closest(".flng-tools, .flng-eng, .relart")) return;
        txt += n.textContent.trim() + ". ";
      });
      txt = txt.replace(/\s+/g, " ").slice(0, 9000);
      if (!txt) return;
      var u = new SpeechSynthesisUtterance(txt);
      u.lang = "fr-FR"; u.rate = 1;
      var voices = speechSynthesis.getVoices();
      var fr = voices.filter(function (v) { return /fr/i.test(v.lang); })[0];
      if (fr) u.voice = fr;
      u.onend = stopTTS; u.onerror = stopTTS;
      try { speechSynthesis.cancel(); speechSynthesis.speak(u); speaking = true; listenBtn.setAttribute("aria-pressed", "true"); listenBtn.querySelector("span").textContent = "Stop"; } catch (_) { stopTTS(); }
    });
    addEventListener("beforeunload", stopTTS);
  }

  /* ---------- 4. bloc engagement : chat IA ancré + réactions ---------- */
  var eng = el("section", { "class": "flng-eng", id: "flng-eng-reveal", "aria-label": "Discuter avec cet article" });
  eng.innerHTML =
    '<h3>💬 Discuter avec cet article</h3>'
    + '<p class="flng-sub">Une IA répond à vos questions <b>à partir de cet article</b>. Essayez&nbsp;:</p>'
    + '<div class="flng-chips">'
    + '<button class="flng-chip" type="button">Résume en 3 points</button>'
    + '<button class="flng-chip" type="button">L\'essentiel à retenir&nbsp;?</button>'
    + '<button class="flng-chip" type="button">Ça concerne mon activité&nbsp;?</button>'
    + '</div>'
    + '<div class="flng-ask"><input type="text" placeholder="Posez votre question sur cet article…" aria-label="Votre question sur l\'article"><button type="button">Demander</button></div>'
    + '<div class="flng-ans" aria-live="polite"></div>'
    + '<div class="flng-react"><span class="lbl">Cet article vous a aidé&nbsp;?</span>'
    + '<button type="button" data-r="utile"><span>👍</span> Utile <span class="ct"></span></button>'
    + '<button type="button" data-r="coeur"><span>❤️</span> J\'adore <span class="ct"></span></button>'
    + '<button type="button" data-r="waouh"><span>✨</span> Inspirant <span class="ct"></span></button>'
    + '</div>';
  var relart = article.querySelector(".relart");
  if (relart) article.insertBefore(eng, relart); else article.appendChild(eng);

  var input = eng.querySelector(".flng-ask input");
  var sendBtn = eng.querySelector(".flng-ask button");
  var ansBox = eng.querySelector(".flng-ans");
  function context() {
    var t = "";
    [].forEach.call(article.querySelectorAll("h1, h2, h3, p, li, th, td"), function (n) {
      if (n.closest(".flng-tools, .flng-eng, .relart")) return;
      t += n.textContent.trim() + "\n";
    });
    return t.replace(/\n{2,}/g, "\n").slice(0, 6000);
  }
  var busy = false;
  function ask(q) {
    q = (q || "").trim(); if (!q || busy) return;
    busy = true; sendBtn.disabled = true;
    ansBox.classList.add("show");
    ansBox.innerHTML = '<div class="flng-q">' + esc(q) + '</div><span>L\'IA lit l\'article…</span>';
    fetch(API + "/ask-article", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: q, context: context(), slug: slug })
    }).then(function (r) { return r.json(); }).then(function (d) {
      var a = (d && d.reply) ? d.reply : "Je n'ai pas pu répondre à l'instant. Vous pouvez reformuler, ou en parler directement à François.";
      ansBox.innerHTML = '<div class="flng-q">' + esc(q) + '</div>' + esc(a).replace(/\n/g, "<br>")
        + '<small>Réponse générée par IA à partir de cet article — pour un conseil personnalisé, <a href="/contact.html" style="color:#8fe6f0">contactez François</a>.</small>';
    }).catch(function () {
      ansBox.innerHTML = '<div class="flng-q">' + esc(q) + '</div>Connexion momentanément indisponible. Réessayez, ou <a href="/contact.html" style="color:#8fe6f0">écrivez à François</a>.';
    }).then(function () { busy = false; sendBtn.disabled = false; });
  }
  sendBtn.addEventListener("click", function () { ask(input.value); });
  input.addEventListener("keydown", function (e) { if (e.key === "Enter") ask(input.value); });
  [].forEach.call(eng.querySelectorAll(".flng-chip"), function (c) {
    c.addEventListener("click", function () { input.value = c.textContent.replace(/ /g, " ").trim(); ask(input.value); });
  });

  /* réactions */
  var reactBtns = [].slice.call(eng.querySelectorAll(".flng-react button"));
  function paint(counts) {
    reactBtns.forEach(function (b) {
      var t = b.getAttribute("data-r");
      var c = counts && counts[t] ? counts[t] : 0;
      b.querySelector(".ct").textContent = c > 0 ? c : "";
      if (localStorage.getItem("flng-r-" + slug + "-" + t)) b.classList.add("done");
    });
  }
  fetch(API + "/reactions?slug=" + encodeURIComponent(slug)).then(function (r) { return r.json(); }).then(function (d) { paint(d && d.counts); }).catch(function () {});
  reactBtns.forEach(function (b) {
    b.addEventListener("click", function () {
      var t = b.getAttribute("data-r");
      if (localStorage.getItem("flng-r-" + slug + "-" + t)) return;
      localStorage.setItem("flng-r-" + slug + "-" + t, "1");
      b.classList.add("done");
      fetch(API + "/reactions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: slug, type: t }) })
        .then(function (r) { return r.json(); }).then(function (d) { paint(d && d.counts); }).catch(function () {});
    });
  });

  /* reveal animation */
  if (!RM && "IntersectionObserver" in window) {
    var ro = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { eng.classList.add("in"); ro.disconnect(); } }); }, { rootMargin: "0px 0px -10% 0px" });
    ro.observe(eng);
  } else { eng.classList.add("in"); }

  onScroll();
})();
