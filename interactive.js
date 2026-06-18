/* =====================================================================
   FL — Couche INTERACTIVE : compteurs animés, tilt 3D, palette ⌘K,
   quiz « quel service ? », drawer devis express.
   Vanilla, a11y, prefers-reduced-motion. Réutilise window.FLModal (popups.js).
   ===================================================================== */
(function () {
  'use strict';
  var RM = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var FINE = !!(window.matchMedia && window.matchMedia('(hover:hover) and (pointer:fine)').matches);

  function el(tag, attrs, html) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) { if (attrs.hasOwnProperty(k)) n.setAttribute(k, attrs[k]); }
    if (html != null) n.innerHTML = html;
    return n;
  }

  /* ---------- 1. Compteurs animés (chiffres RÉELS uniquement) ---------- */
  function animateCount(node) {
    var raw = node.getAttribute('data-count');
    var target = parseFloat(raw);
    if (isNaN(target)) { node.textContent = raw; return; }
    if (RM) { node.textContent = raw; return; }
    var dur = 1100, start = null;
    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 0.5 - Math.cos(p * Math.PI) / 2;
      node.textContent = Math.round(target * eased);
      if (p < 1) requestAnimationFrame(step); else node.textContent = raw;
    }
    requestAnimationFrame(step);
  }
  function initCounters() {
    var nodes = document.querySelectorAll('[data-count]');
    if (!nodes.length) return;
    if (!('IntersectionObserver' in window)) { Array.prototype.forEach.call(nodes, function (n) { n.textContent = n.getAttribute('data-count'); }); return; }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { animateCount(e.target); io.unobserve(e.target); } });
    }, { threshold: 0.6 });
    Array.prototype.forEach.call(nodes, function (n) { n.textContent = '0'; io.observe(n); });
  }

  /* ---------- 2. Tilt 3D + suivi souris sur les cartes ---------- */
  function initTilt() {
    if (RM || !FINE) return;
    var cards = document.querySelectorAll('.svc, .why-card');
    Array.prototype.forEach.call(cards, function (c) {
      c.classList.add('fl-tilt');
      c.addEventListener('mousemove', function (e) {
        var r = c.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5;
        var py = (e.clientY - r.top) / r.height - 0.5;
        c.style.transform = 'perspective(820px) rotateX(' + (-py * 5).toFixed(2) + 'deg) rotateY(' + (px * 6).toFixed(2) + 'deg) translateY(-3px)';
      });
      c.addEventListener('mouseleave', function () { c.style.transform = ''; });
    });
  }

  /* ---------- 3. Palette de commande ⌘K ---------- */
  var PAGES = [
    { g: 'Services', i: '🧩', l: 'Réseaux sociaux', u: 'community-manager.html' },
    { g: 'Services', i: '🌐', l: 'Création de site internet', u: 'creation-site-internet.html' },
    { g: 'Services', i: '🎨', l: 'Modèles de sites', u: 'modeles/' },
    { g: 'Services', i: '🏆', l: 'Réalisations', u: 'realisations.html' },
    { g: 'Services', i: '💶', l: 'Tarifs', u: 'tarifs.html' },
    { g: 'Outils', i: '🔎', l: 'Audit SEO gratuit', u: 'audit-seo-gratuit.html' },
    { g: 'Outils', i: '📊', l: 'Audit réseaux sociaux', u: 'audit-reseaux-sociaux.html' },
    { g: 'Outils', i: '🎁', l: 'Diagnostic gratuit', u: 'audit-gratuit.html' },
    { g: 'Le blog', i: '✍️', l: 'Blog & conseils', u: 'blog/' },
    { g: 'Contact', i: '📅', l: 'Réserver un créneau / Contact', u: 'contact.html' },
    { g: 'Contact', i: '📞', l: 'Appeler le 06 98 20 02 08', u: 'tel:+33698200208' },
    { g: 'À propos', i: '👤', l: 'À propos de François', u: 'a-propos.html' },
    { g: 'Communes', i: '📍', l: 'Lavernose-Lacasse', u: 'community-manager-lavernose-lacasse.html' },
    { g: 'Communes', i: '📍', l: 'Muret', u: 'community-manager-muret.html' },
    { g: 'Communes', i: '📍', l: 'Carbonne', u: 'community-manager-carbonne.html' },
    { g: 'Communes', i: '📍', l: 'Portet-sur-Garonne', u: 'community-manager-portet-sur-garonne.html' },
    { g: 'Communes', i: '📍', l: 'Auterive', u: 'community-manager-auterive.html' },
    { g: 'Communes', i: '📍', l: 'Saint-Lys', u: 'community-manager-saint-lys.html' },
    { g: 'Communes', i: '📍', l: 'Rieumes', u: 'community-manager-rieumes.html' },
    { g: 'Communes', i: '📍', l: 'Fonsorbes', u: 'community-manager-fonsorbes.html' },
    { g: 'Communes', i: '📍', l: 'Eaunes', u: 'community-manager-eaunes.html' },
    { g: 'Communes', i: '📍', l: 'Seysses', u: 'community-manager-seysses.html' },
    { g: 'Communes', i: '📍', l: 'Le Fauga', u: 'community-manager-le-fauga.html' },
    { g: 'Communes', i: '📍', l: 'Noé', u: 'community-manager-noe.html' },
    { g: 'Communes', i: '📍', l: 'Longages', u: 'community-manager-longages.html' },
    { g: 'Communes', i: '📍', l: 'Capens', u: 'community-manager-capens.html' },
    { g: 'Communes', i: '📍', l: 'Lézat-sur-Lèze', u: 'community-manager-lezat-sur-leze.html' }
  ];
  function openPalette() {
    if (!window.FLModal || window.__flLock) return;
    var sel = 0, filtered = [];
    var ov = el('div', { 'class': 'fl-ov fl-ov-palette', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Recherche rapide sur le site' });
    var box = el('div', { 'class': 'fl-palette' });
    var top = el('div', { 'class': 'fl-pal-in' });
    top.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>';
    var input = el('input', { type: 'text', placeholder: 'Rechercher une page ou une action…', 'aria-label': 'Rechercher', 'data-fl-autofocus': '1', autocomplete: 'off', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'fl-pal-list' });
    top.appendChild(input);
    top.appendChild(el('span', { 'class': 'esc', 'aria-hidden': 'true' }, 'Échap'));
    box.appendChild(top);
    var list = el('div', { 'class': 'fl-pal-list', id: 'fl-pal-list', role: 'listbox' });
    box.appendChild(list);
    ov.appendChild(box);
    ov.addEventListener('click', function (e) { if (e.target === ov) window.FLModal.close(); });

    function nodes() { return list.querySelectorAll('.fl-pal-item'); }
    function setSel(i) { sel = i; var ns = nodes(); for (var k = 0; k < ns.length; k++) ns[k].classList.toggle('sel', k === i); var c = ns[sel]; if (c) { input.setAttribute('aria-activedescendant', c.id); c.scrollIntoView({ block: 'nearest' }); } }
    function render() {
      var q = input.value.trim().toLowerCase();
      filtered = q ? PAGES.filter(function (p) { return (p.l + ' ' + p.g).toLowerCase().indexOf(q) >= 0; }) : PAGES.slice();
      list.innerHTML = '';
      if (!filtered.length) { list.appendChild(el('div', { 'class': 'fl-pal-empty' }, 'Aucun résultat. Essayez « audit », « tarifs », « Muret »…')); return; }
      var lastG = null, idx = 0;
      filtered.forEach(function (p) {
        if (p.g !== lastG) { list.appendChild(el('div', { 'class': 'fl-pal-group' }, p.g)); lastG = p.g; }
        var a = el('a', { 'class': 'fl-pal-item' + (idx === 0 ? ' sel' : ''), href: p.u, role: 'option', id: 'flpi' + idx });
        a.innerHTML = '<span class="ico" aria-hidden="true">' + p.i + '</span><span class="lbl">' + p.l + '</span><small aria-hidden="true">↵</small>';
        (function (ix) { a.addEventListener('mousemove', function () { if (sel !== ix) setSel(ix); }); a.addEventListener('click', function (e) { e.preventDefault(); navTo(a.getAttribute('href')); }); })(idx);
        list.appendChild(a); idx++;
      });
      sel = 0; setSel(0);
    }
    function navTo(href) { window.FLModal.close(); location.href = href; }
    function go() { var ns = nodes(); if (ns[sel]) navTo(ns[sel].getAttribute('href')); }
    input.addEventListener('input', render);
    input.addEventListener('keydown', function (e) {
      var ns = nodes();
      if (e.key === 'ArrowDown') { e.preventDefault(); if (ns.length) setSel((sel + 1) % ns.length); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (ns.length) setSel((sel - 1 + ns.length) % ns.length); }
      else if (e.key === 'Enter') { e.preventDefault(); go(); }
    });
    render();
    window.FLModal.open(ov);
  }
  function initPalette() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-fl-palette]'), function (b) {
      b.addEventListener('click', function (e) { e.preventDefault(); openPalette(); });
    });
    document.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); openPalette(); }
    });
  }

  /* ---------- 4. Quiz « quel service pour vous ? » ---------- */
  var QUIZ = [
    { q: 'Aujourd\'hui, votre priorité c\'est…', a: [
      { t: 'Être plus visible sur les réseaux sociaux', k: 'social' },
      { t: 'Avoir (ou refaire) un site internet', k: 'web' },
      { t: 'Les deux — une présence complète', k: 'both' },
      { t: 'Je ne sais pas trop, j\'aimerais un avis', k: 'unsure' }
    ] },
    { q: 'Et votre activité, elle en est où ?', a: [
      { t: 'Je démarre / je me lance', k: 'start' },
      { t: 'J\'existe mais je suis peu visible', k: 'grow' },
      { t: 'Je tourne bien, je veux passer un cap', k: 'scale' }
    ] }
  ];
  var RECO = {
    social: { h: 'La gestion de vos réseaux sociaux', p: 'Pour une présence régulière sur Facebook, Instagram &amp; Google Business : ma formule réseaux sociaux, <b>dès 180 €/mois, sans engagement</b>.', c: [{ l: 'Voir les formules réseaux →', u: 'community-manager.html', p: true }, { l: 'En parler (offert)', u: 'contact.html' }] },
    web: { h: 'La création de votre site internet', p: 'Un site vitrine moderne, rapide et <b>référencé localement</b> — dès 590 €, référencement local inclus.', c: [{ l: 'Voir la création de site →', u: 'creation-site-internet.html', p: true }, { l: 'Voir des modèles', u: 'modeles/' }] },
    both: { h: 'Réseaux sociaux + site internet', p: 'La présence complète, gérée par <b>un seul interlocuteur</b> : un site qui vous appartient et des réseaux animés. C\'est exactement ma double casquette.', c: [{ l: 'En discuter (échange offert) →', u: 'contact.html', p: true }, { l: 'Voir les tarifs', u: 'tarifs.html' }] },
    unsure: { h: 'Commençons par un diagnostic gratuit', p: 'Je passe au crible votre présence actuelle et je vous renvoie <b>3 actions concrètes</b>, sans engagement. On y verra clair ensemble.', c: [{ l: 'Demander mon diagnostic →', u: 'contact.html', p: true }, { l: 'Tester mon SEO', u: 'audit-seo-gratuit.html' }] }
  };
  function openQuiz() {
    if (!window.FLModal || window.__flLock) return;
    var step = 0, primary = null;
    var node = el('div', {});
    function paint() {
      node.innerHTML = '';
      if (step < QUIZ.length) {
        node.appendChild(el('div', { 'class': 'fl-quiz-prog' }, 'Question ' + (step + 1) + ' / ' + QUIZ.length));
        node.appendChild(el('div', { 'class': 'fl-quiz-q' }, QUIZ[step].q));
        var opts = el('div', { 'class': 'fl-quiz-opts' });
        QUIZ[step].a.forEach(function (o) {
          var b = el('button', { 'class': 'fl-quiz-opt', type: 'button' }, o.t);
          b.addEventListener('click', function () {
            if (step === 0) { primary = o.k; step = (o.k === 'unsure') ? 99 : 1; }
            else { step = 99; }
            paint();
          });
          opts.appendChild(b);
        });
        node.appendChild(opts);
      } else {
        var r = RECO[primary] || RECO.unsure;
        var res = el('div', { 'class': 'fl-quiz-res' });
        res.appendChild(el('h4', null, 'Ma recommandation 👉'));
        res.appendChild(el('div', { 'class': 'reco' }, '<b>' + r.h + '</b><br>' + r.p));
        var act = el('div', { 'class': 'fl-actions' });
        r.c.forEach(function (cc) { act.appendChild(el('a', { 'class': 'fl-btn ' + (cc.p ? 'fl-btn-primary' : 'fl-btn-ghost'), href: cc.u }, cc.l)); });
        res.appendChild(act);
        node.appendChild(res);
      }
      var f = node.querySelector('button, a'); if (f && document.body.contains(node)) f.focus();
    }
    paint();
    window.FLModal.open(window.FLModal.build({ title: 'Trouvons le bon service en 30 secondes', node: node }));
  }
  function initQuiz() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-fl-quiz]'), function (b) {
      b.addEventListener('click', function (e) { e.preventDefault(); openQuiz(); });
    });
  }

  /* ---------- 5. Drawer « Devis express » (mini formulaire Web3Forms) ---------- */
  function openDrawer() {
    if (!window.FLModal || window.__flLock) return;
    var ov = el('div', { 'class': 'fl-ov fl-ov-drawer', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Devis express' });
    var d = el('div', { 'class': 'fl-drawer' });
    var x = el('button', { 'class': 'fl-x', type: 'button', 'aria-label': 'Fermer' }, '&times;');
    x.addEventListener('click', function () { window.FLModal.close(); });
    d.appendChild(x);
    d.appendChild(el('h3', null, 'Devis express ⚡'));
    d.appendChild(el('p', { 'class': 'sub' }, 'Dites-moi l\'essentiel, je reviens vers vous sous 48 h en moyenne.'));
    var form = el('form', { action: 'https://api.web3forms.com/submit', method: 'POST' });
    form.innerHTML =
      '<input type="hidden" name="access_key" value="65a34e63-ed73-4214-a9b4-bc144d952cd5">' +
      '<input type="hidden" name="subject" value="Devis express depuis le site — François Leterrier">' +
      '<input type="hidden" name="from_name" value="Site François Leterrier">' +
      '<input type="hidden" name="redirect" value="https://francoisleterrier.fr/merci.html">' +
      '<input type="checkbox" name="botcheck" style="display:none" tabindex="-1" aria-hidden="true">' +
      '<div class="fl-field"><label>Je veux…</label><div class="fl-pills">' +
      '<label class="fl-pill"><input type="radio" name="besoin" value="Réseaux sociaux" checked><span>Réseaux sociaux</span></label>' +
      '<label class="fl-pill"><input type="radio" name="besoin" value="Un site internet"><span>Un site</span></label>' +
      '<label class="fl-pill"><input type="radio" name="besoin" value="Les deux"><span>Les deux</span></label>' +
      '</div></div>' +
      '<div class="fl-field"><label for="fldr-name">Votre prénom *</label><input id="fldr-name" name="name" type="text" required data-fl-autofocus="1"></div>' +
      '<div class="fl-field"><label for="fldr-contact">Téléphone ou e-mail *</label><input id="fldr-contact" name="contact" type="text" required placeholder="06… ou vous@exemple.fr"></div>' +
      '<div class="fl-field"><label for="fldr-msg">En deux mots (facultatif)</label><textarea id="fldr-msg" name="message" placeholder="Votre activité, votre besoin…"></textarea></div>' +
      '<button class="fl-btn fl-btn-primary" type="submit" style="width:100%;">Envoyer ma demande →</button>' +
      '<p style="font-size:11.5px;color:#69728a;margin:12px 0 0;text-align:center;">En envoyant, vous acceptez la <a href="confidentialite.html" style="color:#22d3ee;">politique de confidentialité</a>.</p>';
    d.appendChild(form);
    ov.appendChild(d);
    ov.addEventListener('click', function (e) { if (e.target === ov) window.FLModal.close(); });
    window.FLModal.open(ov);
  }
  function initDrawer() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-fl-drawer]'), function (b) {
      b.addEventListener('click', function (e) { e.preventDefault(); openDrawer(); });
    });
  }

  /* ---------- init ---------- */
  function init() {
    initCounters();
    initTilt();
    initPalette();
    initQuiz();
    initDrawer();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
