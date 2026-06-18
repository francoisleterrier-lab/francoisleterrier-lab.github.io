/* =====================================================================
   FL — Pop-ups dynamiques (modales accessibles, lightbox, toasts)
   Vanilla JS, sans dépendance. 1 seul overlay modal à la fois (verrou).
   Tout respecte prefers-reduced-motion (via popups.css). CLS = 0.
   ===================================================================== */
(function () {
  'use strict';

  var RM = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var P = (location.pathname || '').toLowerCase();
  var isHome = P === '/' || P === '' || P === '/index.html'; // racine uniquement
  var noAuto = /audit|contact|merci|mentions|confidentialite|modeles/.test(P);

  window.__flLock = window.__flLock || false;
  var uid = 0;

  /* ---------- helpers DOM ---------- */
  function el(tag, attrs, html) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) { if (attrs.hasOwnProperty(k)) n.setAttribute(k, attrs[k]); }
    if (html != null) n.innerHTML = html;
    return n;
  }
  function focusables(node) {
    var sel = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
    return Array.prototype.slice.call(node.querySelectorAll(sel)).filter(function (e) {
      return e.offsetWidth > 0 || e.offsetHeight > 0;
    });
  }

  /* ---------- verrouillage du scroll (compense la scrollbar -> pas de saut) ---------- */
  var prevOverflow, prevPR;
  function lockScroll(on) {
    var h = document.documentElement;
    if (on) {
      prevOverflow = h.style.overflow; prevPR = h.style.paddingRight;
      var sw = window.innerWidth - h.clientWidth;
      h.style.overflow = 'hidden';
      if (sw > 0) h.style.paddingRight = sw + 'px';
    } else {
      h.style.overflow = prevOverflow || '';
      h.style.paddingRight = prevPR || '';
    }
  }
  /* arrière-plan réellement neutralisé (inert = hors focus + hors clic) ; toasts épargnés */
  function bgHidden(on) {
    var kids = document.body.children;
    for (var i = 0; i < kids.length; i++) {
      var k = kids[i];
      if (k.classList && (k.classList.contains('fl-ov') || k.classList.contains('fl-toasts'))) continue;
      if (on) {
        if (!k.__flhid) { k.__flhid = 1; k.setAttribute('aria-hidden', 'true'); try { k.inert = true; } catch (e) {} k.setAttribute('inert', ''); }
      } else if (k.__flhid) {
        k.__flhid = 0; k.removeAttribute('aria-hidden'); try { k.inert = false; } catch (e) {} k.removeAttribute('inert');
      }
    }
  }

  /* ---------- coeur modale ---------- */
  var openOv = null, opener = null, keyHandler = null;

  function openModal(ov) {
    if (window.__flLock) return false;
    window.__flLock = true;
    openOv = ov;
    opener = document.activeElement;
    document.body.appendChild(ov);
    bgHidden(true);
    lockScroll(true);
    void ov.offsetWidth; // reflow -> transition
    ov.classList.add('open');
    var modal = ov.querySelector('.fl-modal');
    var af = ov.querySelector('[data-fl-autofocus]');
    if (af) af.focus();
    else if (modal) { modal.setAttribute('tabindex', '-1'); modal.focus(); }
    else (focusables(ov)[0] || ov).focus();
    keyHandler = function (e) {
      if (e.key === 'Escape' || e.keyCode === 27) { closeModal(); return; }
      if (e.key === 'Tab' || e.keyCode === 9) {
        var fs = focusables(ov);
        if (!fs.length) { e.preventDefault(); if (modal) modal.focus(); return; }
        var first = fs[0], last = fs[fs.length - 1];
        if (fs.indexOf(document.activeElement) === -1) { e.preventDefault(); (e.shiftKey ? last : first).focus(); return; }
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', keyHandler, true);
    return true;
  }

  function closeModal() {
    if (!openOv) return;
    var ov = openOv;
    if (ov.__onClose) { try { ov.__onClose(); } catch (e) {} }
    ov.classList.remove('open');
    document.removeEventListener('keydown', keyHandler, true);
    bgHidden(false);
    lockScroll(false);
    var done = function () { if (ov.parentNode) ov.parentNode.removeChild(ov); };
    if (RM) done(); else setTimeout(done, 320);
    if (opener && opener.focus) { try { opener.focus(); } catch (e) {} }
    window.__flLock = false; openOv = null; opener = null; keyHandler = null;
  }
  window.flCloseModal = closeModal;

  /* construit une modale standard à partir d'options */
  function buildModal(opts) {
    var tid = 'flm' + (++uid);
    var ov = el('div', { 'class': 'fl-ov', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': tid });
    var modal = el('div', { 'class': 'fl-modal' + (opts.wide ? ' fl-lb' : '') });
    var x = el('button', { 'class': 'fl-x', type: 'button', 'aria-label': 'Fermer cette fenêtre' }, '&times;');
    x.addEventListener('click', closeModal);
    modal.appendChild(x);
    var h = el('h3', { id: tid }, opts.title || 'Information');
    modal.appendChild(h);
    if (opts.sub) modal.appendChild(el('p', { 'class': 'sub' }, opts.sub));
    if (opts.bodyHtml) modal.appendChild(el('p', null, opts.bodyHtml));
    if (opts.node) modal.appendChild(opts.node);
    if (opts.actions && opts.actions.length) {
      var act = el('div', { 'class': opts.actionsRow ? 'fl-lb-cta' : 'fl-actions' });
      opts.actions.forEach(function (a) {
        var b;
        if (a.href) {
          b = el('a', { 'class': 'fl-btn ' + (a.primary ? 'fl-btn-primary' : 'fl-btn-ghost'), href: a.href }, a.label);
          if (a.fresh) { b.setAttribute('target', '_blank'); b.setAttribute('rel', 'noopener'); }
        } else {
          b = el('button', { 'class': 'fl-btn ' + (a.primary ? 'fl-btn-primary' : 'fl-btn-ghost'), type: 'button' }, a.label);
          if (a.onClick) b.addEventListener('click', a.onClick);
        }
        act.appendChild(b);
      });
      modal.appendChild(act);
    }
    if (opts.later) {
      var l = el('button', { 'class': 'fl-later', type: 'button' }, 'Plus tard');
      l.addEventListener('click', closeModal);
      modal.appendChild(l);
    }
    if (opts.footHtml) modal.appendChild(el('div', { 'class': 'fl-foot' }, opts.footHtml));
    ov.appendChild(modal);
    ov.addEventListener('click', function (e) { if (e.target === ov) closeModal(); });
    if (opts.onClose) ov.__onClose = opts.onClose;
    return ov;
  }

  /* ---------- toasts (non modaux, role=status) ---------- */
  function toastBox() {
    var b = document.querySelector('.fl-toasts');
    if (!b) { b = el('div', { 'class': 'fl-toasts', role: 'status', 'aria-live': 'polite' }); document.body.appendChild(b); }
    return b;
  }
  function toast(html, ms) {
    var box = toastBox();
    var t = el('div', { 'class': 'fl-toast' });
    t.appendChild(el('span', { 'class': 'tk', 'aria-hidden': 'true' }, '&#10003;'));
    t.appendChild(el('div', { 'class': 'tt' }, html));
    var x = el('button', { 'class': 'tx', type: 'button', 'aria-label': 'Fermer' }, '&times;');
    t.appendChild(x);
    box.appendChild(t);
    void t.offsetWidth;
    t.classList.add('in');
    var timer, life = ms || 7000;
    function rm() { if (t.contains(document.activeElement) && document.body.focus) { try { document.body.focus(); } catch (e) {} } if (t.parentNode) t.parentNode.removeChild(t); }
    function kill() { t.classList.remove('in'); if (RM) rm(); else setTimeout(rm, 400); }
    function pause() { clearTimeout(timer); }
    function resume() { clearTimeout(timer); timer = setTimeout(kill, 2500); }
    x.addEventListener('click', function () { clearTimeout(timer); kill(); });
    timer = setTimeout(kill, life);
    t.addEventListener('mouseenter', pause);
    t.addEventListener('mouseleave', resume);
    t.addEventListener('focusin', pause);
    t.addEventListener('focusout', resume);
  }
  window.flToast = toast;
  /* Coeur modale exposé pour interactive.js (palette ⌘K, quiz, drawer) — réutilise focus trap, verrou, inert, prefers-reduced-motion */
  window.FLModal = { open: openModal, close: closeModal, build: buildModal, toast: toast };

  /* ---------- copier (tél / email) ---------- */
  function copyText(txt, okMsg) {
    function ok() { toast(okMsg || '<b>Copié&nbsp;✓</b>', 4000); }
    function legacy() {
      try {
        var ta = el('textarea', {}); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.focus(); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta); ok();
      } catch (e) {}
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(ok, legacy);
    } else { legacy(); }
  }
  function initCopy() {
    var btns = document.querySelectorAll('[data-fl-copy]');
    Array.prototype.forEach.call(btns, function (b) {
      b.addEventListener('click', function (e) {
        e.preventDefault();
        copyText(b.getAttribute('data-fl-copy'), b.getAttribute('data-fl-msg') || '<b>Copié&nbsp;✓</b>');
      });
    });
  }

  /* ---------- Calendly (prise de RDV) — chargé À LA DEMANDE (RGPD : aucun script/cookie tiers tant que l'utilisateur ne clique pas) ---------- */
  var CAL_URL = 'https://calendly.com/fl-conceptimmoplus/30min';
  function loadCalendlyAssets(cb) {
    if (window.Calendly) { cb(); return; }
    if (!document.getElementById('fl-cal-css')) {
      document.head.appendChild(el('link', { id: 'fl-cal-css', rel: 'stylesheet', href: 'https://assets.calendly.com/assets/external/widget.css' }));
    }
    function ready() { if (window.Calendly) cb(); }
    var s = document.getElementById('fl-cal-js');
    if (!s) { s = el('script', { id: 'fl-cal-js', src: 'https://assets.calendly.com/assets/external/widget.js' }); s.addEventListener('load', ready); document.head.appendChild(s); }
    else { s.addEventListener('load', ready); ready(); }
  }
  function openCalendly(url) {
    url = url || CAL_URL;
    loadCalendlyAssets(function () { if (window.Calendly && window.Calendly.initPopupWidget) window.Calendly.initPopupWidget({ url: url }); });
  }
  window.flOpenCalendly = openCalendly;
  function initCalendly() {
    var btns = document.querySelectorAll('[data-fl-calendly]');
    Array.prototype.forEach.call(btns, function (b) {
      b.addEventListener('click', function (e) {
        e.preventDefault();
        openCalendly(b.getAttribute('data-fl-calendly') || b.getAttribute('href') || CAL_URL);
      });
    });
  }
  /* Calendrier Calendly INLINE, chargé à la demande (RGPD : aucun script/cookie tiers avant le clic) */
  function initCalendlyInline() {
    var holders = document.querySelectorAll('[data-fl-cal-inline]');
    Array.prototype.forEach.call(holders, function (h) {
      var url = h.getAttribute('data-fl-cal-inline') || CAL_URL;
      var ph = el('div', { 'class': 'fl-cal-ph' });
      ph.appendChild(el('div', { 'class': 'fl-cal-ph-ic', 'aria-hidden': 'true' }, '📅'));
      ph.appendChild(el('h3', null, 'Réservez votre créneau de 30 min'));
      ph.appendChild(el('p', null, 'Choisissez l\'horaire qui vous arrange. Le calendrier s\'affiche à votre demande — aucun cookie Calendly n\'est chargé avant votre clic.'));
      var btn = el('button', { 'class': 'fl-btn fl-btn-primary', type: 'button' }, 'Afficher les créneaux disponibles');
      ph.appendChild(btn);
      h.appendChild(ph);
      btn.addEventListener('click', function () {
        btn.disabled = true; btn.textContent = 'Chargement du calendrier…';
        loadCalendlyAssets(function () {
          h.innerHTML = '';
          var w = el('div', { 'class': 'calendly-inline-widget', style: 'min-width:320px;height:700px;' });
          h.appendChild(w);
          if (window.Calendly && window.Calendly.initInlineWidget) window.Calendly.initInlineWidget({ url: url, parentElement: w });
        });
      });
    });
  }

  /* ---------- Lightbox : aperçu live des modèles ---------- */
  function initLightbox() {
    var cards = document.querySelectorAll('[data-fl-demo]');
    if (!cards.length) return;
    var demos = Array.prototype.map.call(cards, function (c) {
      return { file: c.getAttribute('data-fl-demo'), name: c.getAttribute('data-fl-demo-name') || 'Modèle' };
    });
    var isMobile = !!(window.matchMedia && window.matchMedia('(max-width:768px)').matches);

    function open(idx) {
      var cur = idx, frameWrap, urlBar, titleEl, countEl, fsLink;

      function render() {
        var d = demos[cur];
        if (titleEl) titleEl.innerHTML = 'Aperçu du modèle « ' + d.name + ' »';
        if (fsLink) fsLink.setAttribute('href', d.file);
        if (countEl) countEl.textContent = (cur + 1) + ' / ' + demos.length;
        if (urlBar) urlBar.textContent = 'francoisleterrier.fr/modeles/' + d.file;
        frameWrap.innerHTML = '';
        if (isMobile) {
          var w = el('div', { 'class': 'fl-mob-open' });
          w.appendChild(el('a', { 'class': 'fl-btn fl-btn-primary', href: d.file, target: '_blank', rel: 'noopener' }, 'Ouvrir la démo « ' + d.name + ' » →'));
          frameWrap.appendChild(w);
        } else {
          frameWrap.appendChild(el('iframe', { src: d.file, title: 'Aperçu du modèle ' + d.name, loading: 'lazy', tabindex: '-1' }));
        }
      }

      var browser = el('div', { 'class': 'fl-browser' });
      var bar = el('div', { 'class': 'fl-bbar' });
      bar.appendChild(el('span', { 'class': 'fl-dots', 'aria-hidden': 'true' }, '<i></i><i></i><i></i>'));
      urlBar = el('span', { 'class': 'fl-url' });
      bar.appendChild(urlBar);
      browser.appendChild(bar);
      frameWrap = el('div', { 'class': 'fl-frame-wrap' });
      browser.appendChild(frameWrap);

      var lbbar = el('div', { 'class': 'fl-lb-bar' });
      if (!isMobile) {
        var toggle = el('div', { 'class': 'fl-toggle', role: 'group', 'aria-label': 'Affichage bureau ou mobile' });
        var bDesk = el('button', { type: 'button', 'aria-pressed': 'true' }, 'Bureau');
        var bMob = el('button', { type: 'button', 'aria-pressed': 'false' }, 'Mobile');
        bDesk.addEventListener('click', function () { frameWrap.classList.remove('mob'); bDesk.setAttribute('aria-pressed', 'true'); bMob.setAttribute('aria-pressed', 'false'); });
        bMob.addEventListener('click', function () { frameWrap.classList.add('mob'); bMob.setAttribute('aria-pressed', 'true'); bDesk.setAttribute('aria-pressed', 'false'); });
        toggle.appendChild(bDesk); toggle.appendChild(bMob);
        lbbar.appendChild(toggle);
      } else { lbbar.appendChild(el('span', {}, '')); }

      var nav = el('div', { 'class': 'fl-nav' });
      var prev = el('button', { type: 'button', 'aria-label': 'Modèle précédent' }, '&#8592;');
      countEl = el('span', { 'class': 'fl-count', 'aria-live': 'polite' });
      var next = el('button', { type: 'button', 'aria-label': 'Modèle suivant' }, '&#8594;');
      prev.addEventListener('click', function () { cur = (cur - 1 + demos.length) % demos.length; render(); prev.focus(); });
      next.addEventListener('click', function () { cur = (cur + 1) % demos.length; render(); next.focus(); });
      nav.appendChild(prev); nav.appendChild(countEl); nav.appendChild(next);
      lbbar.appendChild(nav);

      var wrapNode = el('div', {});
      wrapNode.appendChild(browser);
      wrapNode.appendChild(lbbar);

      var ov = buildModal({
        wide: true,
        title: 'Aperçu du modèle',
        sub: 'Entièrement réalisé en HTML/CSS/JS — responsive et rapide. Basculez Bureau / Mobile pour le voir s\'adapter en direct.',
        node: wrapNode,
        actionsRow: true,
        actions: [
          { label: 'Ouvrir en plein écran', href: demos[cur].file, fresh: true },
          { label: 'Je veux un site comme ça →', href: 'contact.html', primary: true }
        ]
      });
      titleEl = ov.querySelector('h3');
      fsLink = ov.querySelector('.fl-lb-cta a');
      render();
      ov.addEventListener('keydown', function (e) {
        var tag = (document.activeElement && document.activeElement.tagName) || '';
        if (tag === 'IFRAME') return;
        if (e.key === 'ArrowLeft') { cur = (cur - 1 + demos.length) % demos.length; render(); }
        else if (e.key === 'ArrowRight') { cur = (cur + 1) % demos.length; render(); }
      });
      openModal(ov);
    }

    Array.prototype.forEach.call(cards, function (c, i) {
      c.addEventListener('click', function (e) {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return; // laisse ouvrir dans un onglet
        e.preventDefault();
        open(i);
      });
    });
  }

  /* ---------- stockage / plafonnement ---------- */
  function seenThisSession(k) { try { return sessionStorage.getItem(k) === '1'; } catch (e) { return false; } }
  function markSession(k) { try { sessionStorage.setItem(k, '1'); } catch (e) {} }
  function suppressed(k, days) {
    try { var v = localStorage.getItem(k); if (!v) return false; return (Date.now() - parseInt(v, 10)) < days * 864e5; } catch (e) { return false; }
  }
  function suppress(k) { try { localStorage.setItem(k, '' + Date.now()); } catch (e) {} }
  /* ne rien déclencher pendant qu'un overlay est ouvert ou que le bandeau cookies est affiché */
  function blocked() { return window.__flLock || !!document.querySelector('.cip-consent'); }

  /* ---------- Toast d'accueil (non modal, ~6 s ou 25% de scroll) ---------- */
  function armHello() {
    if (seenThisSession('fl-hello')) return;
    var done = false, t;
    function cleanup() { clearTimeout(t); window.removeEventListener('scroll', onScroll); }
    function go() {
      if (done || seenThisSession('fl-hello')) return;
      if (blocked()) { clearTimeout(t); t = setTimeout(go, 4000); return; }
      done = true; markSession('fl-hello'); cleanup();
      toast('👋 <b>Bonjour&nbsp;!</b> Je crée des sites &amp; je gère les réseaux dans le Sud-Toulousain. <a href="modeles/">Voir mes modèles →</a>', 11000);
    }
    function onScroll() {
      var h = document.documentElement;
      if ((h.scrollTop || document.body.scrollTop) / ((h.scrollHeight - h.clientHeight) || 1) > 0.25) go();
    }
    t = setTimeout(go, 6000);
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ---------- Modale d'invitation au diagnostic (scroll 60% ou 25 s) ---------- */
  function armDiagnostic() {
    if (seenThisSession('fl-diag') || suppressed('fl-diag-x', 14)) return;
    var fired = false, t;
    function cleanup() { clearTimeout(t); window.removeEventListener('scroll', onScroll); }
    function onScroll() {
      var h = document.documentElement;
      var denom = (h.scrollHeight - h.clientHeight) || 1;
      if (denom > 40 && (h.scrollTop || document.body.scrollTop) / denom > 0.6) fire();
    }
    function fire() {
      if (fired || seenThisSession('fl-diag')) return;
      if (blocked()) { clearTimeout(t); t = setTimeout(fire, 5000); return; }
      fired = true; markSession('fl-diag'); cleanup();
      var ov = buildModal({
        title: 'Pas sûr de l\'offre qu\'il vous faut&nbsp;? 🤔',
        bodyHtml: 'Commencez par le <b>diagnostic gratuit</b> : je regarde vos réseaux + votre fiche Google et je vous renvoie <b>3 actions concrètes</b>. Sans engagement.',
        actions: [
          { label: 'Demander mon diagnostic →', href: 'contact.html', primary: true },
          { label: 'Tester mon SEO maintenant', href: 'audit-seo-gratuit.html' }
        ],
        later: true,
        onClose: function () { suppress('fl-diag-x'); }
      });
      openModal(ov);
    }
    t = setTimeout(fire, 25000);
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ---------- Exit-intent (desktop uniquement) ---------- */
  function armExit() {
    if (window.innerWidth < 1024) return;
    if (seenThisSession('fl-exit') || suppressed('fl-exit-x', 30)) return;
    var armed = false;
    setTimeout(function () { armed = true; }, 9000); // délai de grâce (laisse passer le bandeau cookies)
    function onLeave(e) {
      if (!armed || seenThisSession('fl-exit')) return;
      if (e.clientY > 0 || e.relatedTarget) return;
      if (blocked()) return; // réessaiera au prochain départ
      markSession('fl-exit');
      document.removeEventListener('mouseout', onLeave);
      var ov = buildModal({
        title: 'Une seconde avant de filer 👋',
        bodyHtml: 'Repartez au moins avec un <b>diagnostic gratuit</b> de votre présence en ligne — score sur 100, sans inscription, en 30 secondes. C\'est exactement ce que fait mon outil d\'audit.',
        actions: [
          { label: 'Auditer mon site gratuitement', href: 'audit-seo-gratuit.html', primary: true },
          { label: 'Voir des modèles de sites', href: 'modeles/' }
        ],
        footHtml: 'Ou écrivez-moi&nbsp;: <a href="tel:+33698200208">06 98 20 02 08</a>',
        onClose: function () { suppress('fl-exit-x'); }
      });
      openModal(ov);
    }
    document.addEventListener('mouseout', onLeave);
  }

  /* ---------- init ---------- */
  function init() {
    initCopy();
    initCalendly();
    initCalendlyInline();
    initLightbox();
    if (isHome && !noAuto) { armHello(); armDiagnostic(); armExit(); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
