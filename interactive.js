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
    // réserver la largeur finale -> aucun reflow/CLS pendant l'animation
    Array.prototype.forEach.call(nodes, function (n) {
      n.textContent = n.getAttribute('data-count');
      var w = n.getBoundingClientRect().width;
      if (w) n.style.minWidth = Math.ceil(w) + 'px';
    });
    if (RM || !('IntersectionObserver' in window)) return; // valeurs réelles déjà affichées
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
    { g: 'Services', i: '💌', l: 'Faire-part digital', u: 'faire-part-digital.html' },
    { g: 'Services', i: '📈', l: 'Référencement SEO', u: 'referencement-seo.html' },
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
    var input = el('input', { type: 'text', placeholder: 'Rechercher une page ou une action…', 'aria-label': 'Rechercher', 'data-fl-autofocus': '1', autocomplete: 'off', role: 'combobox', 'aria-autocomplete': 'list', 'aria-expanded': 'true', 'aria-controls': 'fl-pal-list' });
    top.appendChild(input);
    top.appendChild(el('span', { 'class': 'esc', 'aria-hidden': 'true' }, 'Échap'));
    box.appendChild(top);
    var list = el('div', { 'class': 'fl-pal-list', id: 'fl-pal-list', role: 'listbox' });
    box.appendChild(list);
    ov.appendChild(box);
    ov.addEventListener('click', function (e) { if (e.target === ov) window.FLModal.close(); });

    function nodes() { return list.querySelectorAll('.fl-pal-item'); }
    function setSel(i) { sel = i; var ns = nodes(); for (var k = 0; k < ns.length; k++) { ns[k].classList.toggle('sel', k === i); ns[k].setAttribute('aria-selected', k === i ? 'true' : 'false'); } var c = ns[sel]; if (c) { input.setAttribute('aria-activedescendant', c.id); c.scrollIntoView({ block: 'nearest' }); } }
    function render() {
      var q = input.value.trim().toLowerCase();
      filtered = q ? PAGES.filter(function (p) { return (p.l + ' ' + p.g).toLowerCase().indexOf(q) >= 0; }) : PAGES.slice();
      list.innerHTML = '';
      if (!filtered.length) { input.removeAttribute('aria-activedescendant'); list.appendChild(el('div', { 'class': 'fl-pal-empty' }, 'Aucun résultat. Essayez « audit », « tarifs », « Muret »…')); return; }
      var lastG = null, idx = 0;
      filtered.forEach(function (p) {
        if (p.g !== lastG) { list.appendChild(el('div', { 'class': 'fl-pal-group' }, p.g)); lastG = p.g; }
        var a = el('a', { 'class': 'fl-pal-item' + (idx === 0 ? ' sel' : ''), href: p.u, role: 'option', 'aria-selected': idx === 0 ? 'true' : 'false', id: 'fl-pal-opt-' + idx });
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
  var STAGE = {
    start: ' Et comme vous démarrez, on pose des bases propres dès le départ.',
    grow: ' Objectif prioritaire : vous rendre nettement plus visible dans le secteur.',
    scale: ' On vise à vous faire passer un cap, sans gaspiller votre temps.'
  };
  function openQuiz() {
    if (!window.FLModal || window.__flLock) return;
    var step = 0, primary = null, secondary = null, opened = false;
    var node = el('div', {});
    function paint() {
      node.innerHTML = '';
      if (step < QUIZ.length) {
        node.appendChild(el('div', { 'class': 'fl-quiz-prog' }, 'Question ' + (step + 1) + ' / ' + QUIZ.length));
        var h = el('div', { 'class': 'fl-quiz-q', tabindex: '-1' }); h.textContent = QUIZ[step].q;
        if (!opened) h.setAttribute('data-fl-autofocus', '1');
        node.appendChild(h);
        var opts = el('div', { 'class': 'fl-quiz-opts' });
        QUIZ[step].a.forEach(function (o) {
          var b = el('button', { 'class': 'fl-quiz-opt', type: 'button' }, o.t);
          b.addEventListener('click', function () {
            if (step === 0) { primary = o.k; step = (o.k === 'unsure') ? 99 : 1; }
            else { secondary = o.k; step = 99; }
            paint();
          });
          opts.appendChild(b);
        });
        node.appendChild(opts);
        if (opened) h.focus();
      } else {
        var r = RECO[primary] || RECO.unsure;
        var res = el('div', { 'class': 'fl-quiz-res' });
        var h4 = el('h4', { tabindex: '-1' }, 'Ma recommandation 👉');
        res.appendChild(h4);
        var txt = r.p + (secondary && STAGE[secondary] ? STAGE[secondary] : '');
        res.appendChild(el('div', { 'class': 'reco' }, '<b>' + r.h + '</b><br>' + txt));
        var act = el('div', { 'class': 'fl-actions' });
        r.c.forEach(function (cc) { act.appendChild(el('a', { 'class': 'fl-btn ' + (cc.p ? 'fl-btn-primary' : 'fl-btn-ghost'), href: cc.u }, cc.l)); });
        res.appendChild(act);
        node.appendChild(res);
        if (opened) h4.focus();
      }
    }
    paint();
    window.FLModal.open(window.FLModal.build({ title: 'Trouvons le bon service en 30 secondes', node: node }));
    opened = true;
  }
  function initQuiz() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-fl-quiz]'), function (b) {
      b.addEventListener('click', function (e) { e.preventDefault(); openQuiz(); });
    });
  }

  /* ---------- 5. Drawer « Devis express » (mini formulaire Web3Forms) ---------- */
  function openDrawer(pre) {
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
      '<fieldset><legend>Je veux…</legend><div class="fl-pills" role="radiogroup" aria-label="Je veux…">' +
      '<label class="fl-pill"><input type="radio" name="besoin" value="Réseaux sociaux" checked><span>Réseaux sociaux</span></label>' +
      '<label class="fl-pill"><input type="radio" name="besoin" value="Un site internet"><span>Un site</span></label>' +
      '<label class="fl-pill"><input type="radio" name="besoin" value="Les deux"><span>Les deux</span></label>' +
      '</div></fieldset>' +
      '<div class="fl-field"><label for="fldr-name">Votre prénom *</label><input id="fldr-name" name="name" type="text" required data-fl-autofocus="1"></div>' +
      '<div class="fl-field"><label for="fldr-contact">Téléphone ou e-mail *</label><input id="fldr-contact" name="contact" type="text" required placeholder="06… ou vous@exemple.fr"></div>' +
      '<div class="fl-field"><label for="fldr-msg">En deux mots (facultatif)</label><textarea id="fldr-msg" name="message" placeholder="Votre activité, votre besoin…"></textarea></div>' +
      '<button class="fl-btn fl-btn-primary" type="submit" style="width:100%;">Envoyer ma demande →</button>' +
      '<p class="fl-drawer-note">En envoyant, vous acceptez la <a href="confidentialite.html">politique de confidentialité</a>.</p>';
    d.appendChild(form);
    ov.appendChild(d);
    ov.addEventListener('click', function (e) { if (e.target === ov) window.FLModal.close(); });
    if (pre) {
      if (pre.besoin) { var rb = form.querySelector('input[name="besoin"][value="' + pre.besoin + '"]'); if (rb) rb.checked = true; }
      if (pre.msg) { var mf = form.querySelector('#fldr-msg'); if (mf) mf.value = pre.msg; }
    }
    window.FLModal.open(ov);
  }
  function initDrawer() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-fl-drawer]'), function (b) {
      b.addEventListener('click', function (e) { e.preventDefault(); openDrawer(); });
    });
  }

  /* ---------- 6. Simulateur SERP / Google Business / partage ---------- */
  var SERP_M = {
    boulangerie: { cat: 'Boulangerie-pâtisserie', t: "{n} — Boulangerie artisanale à {v}", d: "Pains, viennoiseries et pâtisseries maison à {v}. Découvrez {n} : nos spécialités, nos horaires et où nous trouver. Le bon pain, tout près de chez vous." },
    restaurant: { cat: 'Restaurant', t: "{n} — Restaurant à {v} | Réservez", d: "Cuisine fait-maison à {v}. {n} vous accueille midi et soir : carte, menus et réservation. Réservez votre table en quelques clics." },
    coiffure: { cat: 'Salon de coiffure', t: "{n} — Coiffeur à {v} | Prendre RDV", d: "Salon de coiffure à {v}. Coupe, couleur, soins : prenez rendez-vous en ligne chez {n}. Une équipe à l'écoute, tout près de chez vous." },
    plombier: { cat: 'Plombier-chauffagiste', t: "{n} — Plombier à {v} | Devis gratuit", d: "Dépannage, installation et chauffage à {v} et alentours. {n} intervient vite et proprement. Devis gratuit, appelez dès aujourd'hui." },
    electricien: { cat: 'Électricien', t: "{n} — Électricien à {v} | Devis gratuit", d: "Installation, dépannage et mise aux normes à {v}. {n}, artisan électricien de confiance. Devis gratuit et intervention rapide." },
    'bien-etre': { cat: 'Bien-être & thérapies', t: "{n} — Bien-être à {v} | Sur rendez-vous", d: "Séances de bien-être à {v}. {n} vous accompagne en toute bienveillance. Découvrez les prestations et réservez votre créneau en ligne." },
    immobilier: { cat: 'Agence immobilière', t: "{n} — Agence immobilière à {v}", d: "Achat, vente et location à {v} et dans le secteur. {n} vous accompagne à chaque étape de votre projet. Estimation offerte." },
    commerce: { cat: 'Commerce de proximité', t: "{n} — Votre commerce à {v}", d: "{n}, votre commerce de proximité à {v}. Découvrez nos produits, nos horaires et nos actualités. On vous attend tout près de chez vous." },
    autre: { cat: 'Entreprise locale', t: "{n} — {v} et alentours", d: "{n}, à {v} et dans le Sud-Toulousain. Découvrez nos services, nos horaires et comment nous contacter. Un savoir-faire local à votre service." }
  };
  function serpSlug(s) {
    s = (s || '').toLowerCase()
      .replace(/[àâäáã]/g, 'a').replace(/[éèêë]/g, 'e').replace(/[îï]/g, 'i')
      .replace(/[ôöó]/g, 'o').replace(/[ûüù]/g, 'u').replace(/ç/g, 'c').replace(/œ/g, 'oe');
    return s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function initSerp() {
    var root = document.getElementById('apercu-google');
    if (!root || root.getAttribute('data-serp-init')) return;
    root.setAttribute('data-serp-init', '1');
    var nom = root.querySelector('#serp-nom'), ville = root.querySelector('#serp-ville'),
        metier = root.querySelector('#serp-metier'), status = root.querySelector('#serp-status');
    var paneG = root.querySelector('#pane-g'), paneM = root.querySelector('#pane-m'), paneO = root.querySelector('#pane-o');
    function fill(tpl, n, v) { return tpl.split('{n}').join(n).split('{v}').join(v); }
    function cur() {
      var n = nom.value.trim() || 'Votre commerce', v = ville.value.trim() || 'votre ville';
      var m = SERP_M[metier.value] || SERP_M.autre, sl = serpSlug(nom.value.trim()) || 'mon-commerce';
      return { n: n, v: v, cat: m.cat, title: fill(m.t, n, v), desc: fill(m.d, n, v), dom: sl + '.fr' };
    }
    function setTxt(pane, sel, val) { var e = pane.querySelector(sel); if (e) e.textContent = val; }
    function render() {
      var c = cur();
      setTxt(paneG, '.g-nm', c.dom); setTxt(paneG, '.g-ur', 'https://www.' + c.dom + ' › accueil');
      setTxt(paneG, '.g-title', c.title); setTxt(paneG, '.g-desc', c.desc);
      setTxt(paneM, '.m-name', c.n); setTxt(paneM, '.m-meta', c.cat + ' · ' + c.v);
      setTxt(paneO, '.o-logo', c.n); setTxt(paneO, '.o-dom', 'www.' + c.dom);
      setTxt(paneO, '.o-title', c.title); setTxt(paneO, '.o-desc', c.desc);
    }
    var dbt;
    function onInput() { render(); if (!status) return; clearTimeout(dbt); dbt = setTimeout(function () { var c = cur(); status.textContent = 'Aperçu mis à jour : ' + c.n + ' à ' + c.v + '.'; }, 700); }
    nom.addEventListener('input', onInput); ville.addEventListener('input', onInput); metier.addEventListener('change', onInput);
    render();
    var tabs = Array.prototype.slice.call(root.querySelectorAll('.serp-tab'));
    var panes = { 'pane-g': paneG, 'pane-m': paneM, 'pane-o': paneO };
    function select(tab) {
      tabs.forEach(function (t2) {
        var on = t2 === tab; t2.setAttribute('aria-selected', on ? 'true' : 'false'); t2.tabIndex = on ? 0 : -1;
        var p = panes[t2.getAttribute('aria-controls')]; if (p) p.hidden = !on;
      });
    }
    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { select(tab); });
      tab.addEventListener('keydown', function (e) {
        var idx; if (e.key === 'ArrowRight' || e.key === 'ArrowDown') idx = (i + 1) % tabs.length;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') idx = (i - 1 + tabs.length) % tabs.length; else return;
        e.preventDefault(); tabs[idx].focus(); select(tabs[idx]);
      });
    });
    var copyBtn = root.querySelector('[data-serp-copy]');
    if (copyBtn) copyBtn.addEventListener('click', function () {
      var c = cur(), txt = 'Title : ' + c.title + '\nMeta description : ' + c.desc, orig = copyBtn.textContent;
      function done() {
        copyBtn.textContent = '✓ Copié !';
        setTimeout(function () { copyBtn.textContent = orig; }, 1600);
        if (window.FLModal && window.FLModal.toast) window.FLModal.toast('Title + description copiés ✓');
      }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, done);
      else { try { var ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); } catch (e) {} done(); }
    });
    Array.prototype.forEach.call(root.querySelectorAll('.m-btn'), function (b) {
      b.addEventListener('click', function (e) {
        e.preventDefault();
        if (window.FLModal && window.FLModal.toast) window.FLModal.toast('Aperçu de démonstration — votre vraie fiche Google activera ce bouton.');
      });
    });
  }

  /* ---------- 8. Bannière « parcours adapté » via lien (?metier=&ville=) ---------- */
  var BANNER_M = {
    boulangerie: 'boulangerie', restaurant: 'restaurant', coiffure: 'salon de coiffure',
    plombier: 'entreprise de plomberie', electricien: "entreprise d'électricité",
    'bien-etre': 'activité bien-être', immobilier: 'agence immobilière',
    commerce: 'commerce', artisan: 'entreprise artisanale'
  };
  function initBanner() {
    var s = window.location.search; if (!s) return;
    var p = {}, parts = s.substring(1).split('&'), i;
    for (i = 0; i < parts.length; i++) { var kv = parts[i].split('='); if (kv[0]) { try { p[decodeURIComponent(kv[0])] = decodeURIComponent((kv[1] || '').replace(/\+/g, ' ')); } catch (e) {} } }
    var mlabel = BANNER_M[(p.metier || '').toLowerCase()];
    var ville = (p.ville || '').replace(/[<>&"`]/g, '').replace(/\s+/g, ' ').slice(0, 32).replace(/^ +| +$/g, '');
    if (!mlabel && !ville) return;
    try { if (window.sessionStorage && sessionStorage.getItem('fl-bn')) return; } catch (e2) {}
    var msg;
    if (mlabel && ville) msg = 'Community management & création de site pour votre ' + mlabel + ' à ' + ville + ' — vous êtes au bon endroit.';
    else if (mlabel) msg = 'Spécial ' + mlabel + ' : community management & création de site, près de chez vous.';
    else msg = 'Vous êtes à ' + ville + ' ? Votre Community Manager & créateur de sites du secteur.';
    var bar = el('div', { 'class': 'fl-banner', role: 'region', 'aria-label': 'Message de bienvenue' });
    var span = el('span'); span.textContent = '👋 ' + msg + ' ';
    var cta = el('a', { 'class': 'cta', href: '#contact' }, 'Diagnostic gratuit →');
    var x = el('button', { 'class': 'x', type: 'button', 'aria-label': 'Fermer ce message' }, '&times;');
    x.addEventListener('click', function () { try { sessionStorage.setItem('fl-bn', '1'); } catch (e3) {} if (bar.parentNode) bar.parentNode.removeChild(bar); });
    bar.appendChild(span); bar.appendChild(cta); bar.appendChild(x);
    document.body.insertBefore(bar, document.body.firstChild);
  }

  /* ---------- 9. Estimateur de devis transparent (tarifs RÉELS « à partir de ») ---------- */
  var EST_SITE = { express: 590, vitrine: 1400, surmesure: 2500 };
  var EST_SOCIAL = { essentiel: 180, croissance: 350, premium: 520 };
  function eur(n) { return ('' + n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  function initEstim() {
    var root = document.getElementById('estimateur');
    if (!root || root.getAttribute('data-est-init')) return;
    root.setAttribute('data-est-init', '1');
    var siteBlock = root.querySelector('[data-est-site]'), socialBlock = root.querySelector('[data-est-social]');
    var out = root.querySelector('#est-out'), status = root.querySelector('#est-status');
    if (!out) return;
    function val(sel, d) { var e = root.querySelector(sel); return e ? e.value : d; }
    function besoin() { var r = root.querySelector('input[name="est-besoin"]:checked'); return r ? r.value : 'les-deux'; }
    function maint() { var c = root.querySelector('#est-maint'); return !!(c && c.checked); }
    function line(label, value) { var row = el('div', { 'class': 'est-line' }), a = el('span'), b = el('strong'); a.textContent = label; b.textContent = value; row.appendChild(a); row.appendChild(b); return row; }
    function render() {
      var b = besoin(), wantSite = b !== 'reseaux', wantSoc = b !== 'site';
      if (siteBlock) siteBlock.hidden = !wantSite;
      if (socialBlock) socialBlock.hidden = !wantSoc;
      out.innerHTML = '';
      if (wantSite) { out.appendChild(line('Création du site', 'à partir de ' + eur(EST_SITE[val('#est-site-type', 'vitrine')]) + ' €')); if (maint()) out.appendChild(line('Maintenance du site', '39 €/mois')); }
      if (wantSoc) { out.appendChild(line('Réseaux sociaux', 'à partir de ' + eur(EST_SOCIAL[val('#est-social-f', 'croissance')]) + ' €/mois')); }
    }
    var dbt;
    function onChange() { render(); if (!status) return; clearTimeout(dbt); dbt = setTimeout(function () { status.textContent = 'Estimation mise à jour.'; }, 600); }
    Array.prototype.forEach.call(root.querySelectorAll('input,select'), function (e) { e.addEventListener('change', onChange); });
    render();
    var send = root.querySelector('[data-est-send]');
    if (send) send.addEventListener('click', function (e) {
      e.preventDefault();
      var b = besoin(), parts = [], bl = b === 'site' ? 'Un site internet' : (b === 'reseaux' ? 'Réseaux sociaux' : 'Les deux');
      if (b !== 'reseaux') parts.push('site ' + val('#est-site-type', 'vitrine') + ' (à partir de ' + eur(EST_SITE[val('#est-site-type', 'vitrine')]) + ' €)' + (maint() ? ' + maintenance' : ''));
      if (b !== 'site') parts.push('réseaux ' + val('#est-social-f', 'croissance') + ' (à partir de ' + eur(EST_SOCIAL[val('#est-social-f', 'croissance')]) + ' €/mois)');
      openDrawer({ besoin: bl, msg: 'Bonjour, voici ma configuration estimée via le simulateur : ' + parts.join(' ; ') + '. J\'aimerais un devis précis.' });
    });
  }

  /* ---------- init ---------- */
  function init() {
    initCounters();
    initTilt();
    initPalette();
    initQuiz();
    initDrawer();
    initSerp();
    initBanner();
    initEstim();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
