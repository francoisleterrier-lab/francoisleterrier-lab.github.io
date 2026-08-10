/* Consentement cookies — RGPD/CNIL + Google Consent Mode v2 (francoisleterrier.fr).
   ────────────────────────────────────────────────────────────────────────────
   Modèle : Consent Mode v2 « avancé ».
   • gtag.js se charge d'emblée en mode REFUSÉ par défaut (analytics + pub = denied) :
     Google ne dépose AUCUN cookie de mesure/pub tant que l'utilisateur n'a pas accepté,
     mais reçoit les signaux de consentement → indispensable pour diffuser Google Ads en UE.
   • Sur choix de l'utilisateur : gtag('consent','update', …) (granted/denied), puis
     chargement des outils « prior-blocking » (Ahrefs = analytics, Meta Pixel = pub) qui,
     eux, ne se chargent JAMAIS avant accord.
   • CNIL : refuser est aussi simple qu'accepter (boutons de même niveau), rien n'est
     pré-coché, choix mémorisé (localStorage) et modifiable à tout moment (« Gérer mes
     cookies », injecté dans le pied de page).
   ┌─────────────────────────────────────────────────────────────────────────┐
   │ À CONFIGURER :                                                           │
   │ • GA_ID : « G-WTRP1WD9VV » = propriété GA4 de francoisleterrier.fr.       │
   │ • FB_PIXEL_ID : colle ton ID de Pixel Meta pour activer Meta/Facebook Ads │
   │   (vide = désactivé, aucun script Meta chargé). Rien d'autre à faire.     │
   └─────────────────────────────────────────────────────────────────────────┘ */
(function () {
  'use strict';
  var KEY = 'fl-consent-v2';      // format granulaire { a:Analytics, ad:Pub }
  var OLDKEY = 'cip-consent';     // ancien format 'granted'/'denied' (rétro-compat)
  var GA_ID = 'G-WTRP1WD9VV';     // propriété GA4 francoisleterrier.fr
  var AHREFS_KEY = '70o1z25QpySuipMTMk7FMg';
  var FB_PIXEL_ID = '941645512292397';   // Pixel Meta (Facebook/Instagram) — chargé seulement après consentement « Publicité »

  /* ---------- Consent Mode v2 : socle (DOIT précéder gtag.js) ---------- */
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    functionality_storage: 'denied',
    personalization_storage: 'denied',
    security_storage: 'granted',
    wait_for_update: 500
  });

  /* ---------- gtag.js chargé d'emblée (en mode refusé) ---------- */
  var gaStarted = false;
  function startGtag() {
    if (gaStarted) return; gaStarted = true;
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);
    gtag('js', new Date());
    gtag('config', GA_ID, { anonymize_ip: true });
  }

  /* ---------- outils « prior-blocking » : uniquement APRÈS accord ---------- */
  function loadAhrefs() {
    if (window.__flAhrefs) return; window.__flAhrefs = true;
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://analytics.ahrefs.com/analytics.js';
    s.setAttribute('data-key', AHREFS_KEY);
    document.head.appendChild(s);
  }
  function loadMeta() {
    if (!FB_PIXEL_ID || window.__flPixel) return; window.__flPixel = true;
    /* eslint-disable */
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
      n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,
      'script','https://connect.facebook.net/en_US/fbevents.js');
    /* eslint-enable */
    window.fbq('init', FB_PIXEL_ID);
    window.fbq('track', 'PageView');
  }

  /* ---------- applique un consentement (a = analytics, ad = pub) ---------- */
  function apply(a, ad) {
    gtag('consent', 'update', {
      analytics_storage: a ? 'granted' : 'denied',
      ad_storage: ad ? 'granted' : 'denied',
      ad_user_data: ad ? 'granted' : 'denied',
      ad_personalization: ad ? 'granted' : 'denied',
      personalization_storage: ad ? 'granted' : 'denied',
      functionality_storage: a ? 'granted' : 'denied'
    });
    if (a) loadAhrefs();
    if (ad) loadMeta();
  }
  function store(a, ad) {
    try { localStorage.setItem(KEY, JSON.stringify({ a: !!a, ad: !!ad, t: Date.now() })); } catch (e) {}
  }

  /* Consent Mode : gtag démarre toujours (en mode refusé jusqu'à un éventuel « update »). */
  startGtag();

  /* ---------- lecture du choix mémorisé (+ migration ancien format) ---------- */
  var saved = null;
  try { saved = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
  if (!saved) {
    var old = null; try { old = localStorage.getItem(OLDKEY); } catch (e) {}
    if (old === 'granted') { saved = { a: true, ad: true }; store(true, true); }
    else if (old === 'denied') { saved = { a: false, ad: false }; store(false, false); }
  }
  if (saved) { apply(!!saved.a, !!saved.ad); }

  /* ---------- Bandeau ---------- */
  var css = '.cip-consent{position:fixed;left:16px;right:16px;bottom:16px;z-index:99999;max-width:880px;margin:0 auto;background:rgba(14,19,34,.97);backdrop-filter:blur(10px);border:1px solid rgba(129,74,236,.35);border-radius:16px;padding:16px 18px;box-shadow:0 14px 44px -12px rgba(0,0,0,.7);font-family:Manrope,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;}'
    + '.cip-consent .cip-c-in{display:flex;gap:16px;align-items:center;flex-wrap:wrap;justify-content:space-between;}'
    + '.cip-consent p{margin:0;color:#c4cbdb;font-size:13.5px;line-height:1.6;flex:1;min-width:240px;}'
    + '.cip-consent a{color:#22d3ee;text-decoration:none;}.cip-consent a:hover{text-decoration:underline;}'
    + '.cip-consent .cip-c-btns{display:flex;gap:10px;flex:none;flex-wrap:wrap;justify-content:flex-end;}'
    + '.cip-consent button{cursor:pointer;font-family:inherit;font-weight:700;font-size:13.5px;border-radius:30px;padding:10px 20px;border:1px solid transparent;}'
    + '.cip-consent .cip-c-no,.cip-consent .cip-c-perso{background:transparent;color:#e7ecf6;border:1px solid rgba(255,255,255,.22);}'
    + '.cip-consent .cip-c-no:hover,.cip-consent .cip-c-perso:hover{border-color:#22d3ee;}'
    + '.cip-consent .cip-c-yes,.cip-consent .cip-c-save{background:linear-gradient(120deg,#22d3ee,#a855f7);color:#08111f;border:none;}'
    + '.cip-consent button:focus-visible{outline:3px solid #22d3ee;outline-offset:2px;}'
    + '.cip-consent .cip-c-prefs{display:flex;flex-direction:column;gap:8px;margin:12px 0 0;padding:12px;border-radius:12px;background:rgba(255,255,255,.05);flex-basis:100%;}'
    + '.cip-consent .cip-c-prefs label{display:flex;align-items:center;gap:10px;cursor:pointer;color:#e7ecf6;font-size:13.5px;}'
    + '@media(max-width:560px){.cip-consent .cip-c-in{flex-direction:column;align-items:stretch;}.cip-consent .cip-c-btns{justify-content:stretch;}.cip-consent .cip-c-btns button{flex:1 1 auto;}}';
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var bar = null;
  function buildBar() {
    var b = document.createElement('div');
    b.className = 'cip-consent';
    b.setAttribute('role', 'dialog');
    b.setAttribute('aria-modal', 'true');
    b.setAttribute('aria-label', 'Gestion des cookies');
    var toolNames = ['Google Analytics', 'Ahrefs'];
    if (FB_PIXEL_ID) toolNames.push('Meta (Facebook)');
    var toolList = toolNames.length > 1
      ? toolNames.slice(0, -1).join(', ') + ' &amp; ' + toolNames[toolNames.length - 1]
      : toolNames[0];
    b.innerHTML = '<div class="cip-c-in">'
      + '<p>🍪 On utilise des cookies de mesure d’audience (' + toolList + ') et, le cas échéant, de publicité, pour améliorer le site. Rien n’est déposé sans votre accord — le site fonctionne dans les deux cas. <a href="/confidentialite.html">En savoir plus</a>.</p>'
      + '<div class="cip-c-prefs" hidden>'
      + '<label><input type="checkbox" class="cip-c-a"> Mesure d’audience (Google Analytics, Ahrefs)</label>'
      + '<label><input type="checkbox" class="cip-c-ad"> Publicité &amp; marketing (Google Ads' + (FB_PIXEL_ID ? ', Meta' : '') + ')</label>'
      + '</div>'
      + '<div class="cip-c-btns">'
      + '<button type="button" class="cip-c-no">Tout refuser</button>'
      + '<button type="button" class="cip-c-perso">Personnaliser</button>'
      + '<button type="button" class="cip-c-yes">Tout accepter</button>'
      + '<button type="button" class="cip-c-save" hidden>Enregistrer mes choix</button>'
      + '</div></div>';
    return b;
  }
  function decide(a, ad) {
    store(a, ad); apply(a, ad);
    saved = { a: !!a, ad: !!ad };          // mémorise pour une éventuelle réouverture
    if (bar && bar.parentNode) { bar.parentNode.removeChild(bar); }
    bar = null;
  }
  function showBar() {
    if (bar) return;                         // déjà affiché
    bar = buildBar();
    var prefs = bar.querySelector('.cip-c-prefs');
    var cbA = bar.querySelector('.cip-c-a');
    var cbAd = bar.querySelector('.cip-c-ad');
    var perso = bar.querySelector('.cip-c-perso');
    var saveBtn = bar.querySelector('.cip-c-save');
    // pré-remplir avec le choix courant s'il existe (réouverture)
    if (saved) { cbA.checked = !!saved.a; cbAd.checked = !!saved.ad; }
    bar.querySelector('.cip-c-yes').addEventListener('click', function () { decide(true, true); });
    bar.querySelector('.cip-c-no').addEventListener('click', function () { decide(false, false); });
    perso.addEventListener('click', function () {
      prefs.hidden = false; perso.hidden = true; saveBtn.hidden = false;
    });
    saveBtn.addEventListener('click', function () { decide(cbA.checked, cbAd.checked); });
    var host = document.body || document.documentElement;
    host.appendChild(bar);
  }

  /* API publique : rouvrir le gestionnaire (lien « Gérer mes cookies »). */
  window.flOpenConsent = function () { showBar(); };

  /* ---------- Événements de conversion GA4 (verrou 2 — Google Ads) ---------- */
  /* Envoie un événement GA4. Consent Mode décide s'il est mesuré (analytics_storage)
     ou modélisé — on peut donc toujours l'émettre sans risque RGPD. */
  window.flTrack = function (name, params) {
    try { if (typeof window.gtag === 'function') window.gtag('event', name, params || {}); } catch (e) {}
  };
  /* RDV pris via Calendly (message posté par l'iframe Calendly) → book_appointment. */
  window.addEventListener('message', function (e) {
    if (e && e.data && e.data.event === 'calendly.event_scheduled') {
      window.flTrack('book_appointment', { event_category: 'lead', value: 0, currency: 'EUR' });
      try { if (window.fbq) window.fbq('track', 'Schedule'); } catch (_) {}   // conversion Meta (si consentement pub)
    }
  });
  /* Clic sur un lien téléphone ou e-mail → contact_click (observation). */
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href^="tel:"], a[href^="mailto:"]') : null;
    if (!a) return;
    var kind = a.getAttribute('href').indexOf('tel:') === 0 ? 'tel' : 'email';
    window.flTrack('contact_click', { event_category: 'contact', method: kind });
  }, true);

  /* ---------- lien « Gérer mes cookies » injecté dans le pied de page ---------- */
  function injectManageLink() {
    if (document.querySelector('.fl-cookie-manage')) return;
    var foot = document.querySelector('footer .wrap') || document.querySelector('footer');
    if (!foot) return;
    var a = document.createElement('a');
    a.href = '#'; a.className = 'fl-cookie-manage';
    a.textContent = 'Gérer mes cookies';
    a.style.color = 'inherit';
    a.addEventListener('click', function (e) { e.preventDefault(); showBar(); });
    foot.appendChild(document.createTextNode(' · '));
    foot.appendChild(a);
  }

  function onReady(fn) {
    if (document.body) { fn(); }
    else { document.addEventListener('DOMContentLoaded', fn); }
  }
  onReady(function () {
    injectManageLink();
    if (!saved) { showBar(); }             // 1re visite (aucun choix) → bandeau
  });
})();
