/* Consentement cookies + chargement conditionnel des outils de mesure d'audience (RGPD/CNIL).
   Aucun outil (Google Analytics, Ahrefs, Meta Pixel) ne se charge AVANT le clic « Accepter ».
   Choix mémorisé en localStorage (portée par origine, donc propre à francoisleterrier.fr).

   ┌─────────────────────────────────────────────────────────────────────────┐
   │ À CONFIGURER (une seule ligne à changer pour chaque outil) :             │
   │                                                                          │
   │ • GA_ID : « G-WTRP1WD9VV » = propriété GA4 de francoisleterrier.fr        │
   │   (vérifié le 05/08/2026). Les préfixes « cip » du code ne sont qu'un      │
   │   nommage hérité d'un gabarit — l'ID lui-même est le bon.                  │
   │ • FB_PIXEL_ID : colle ton identifiant de Pixel Meta (ex. « 1234567890 ») │
   │   pour activer le suivi Meta/Facebook Ads. Laissé vide = désactivé, aucun │
   │   script Meta n'est chargé. Rien d'autre à faire (CSP & bandeau prêts).   │
   └─────────────────────────────────────────────────────────────────────────┘ */
(function () {
  var KEY = 'cip-consent';
  var GA_ID = 'G-WTRP1WD9VV';          // propriété GA4 francoisleterrier.fr (vérifié 05/08/2026)
  var AHREFS_KEY = '70o1z25QpySuipMTMk7FMg';
  var FB_PIXEL_ID = '';                // ← colle ici ton ID de Pixel Meta pour l'activer (vide = off)

  function loadGA() {
    if (window.__cipGaLoaded) return;
    window.__cipGaLoaded = true;
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', GA_ID, { anonymize_ip: true });
  }

  function loadAhrefs() {
    if (window.__cipAhrefsLoaded) return;
    window.__cipAhrefsLoaded = true;
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://analytics.ahrefs.com/analytics.js';
    s.setAttribute('data-key', AHREFS_KEY);
    document.head.appendChild(s);
  }

  function loadMetaPixel() {
    if (!FB_PIXEL_ID || window.__flPixelLoaded) return;   // rien si l'ID n'est pas renseigné
    window.__flPixelLoaded = true;
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

  function loadAnalytics() { loadGA(); loadAhrefs(); loadMetaPixel(); }

  var choice = null;
  try { choice = localStorage.getItem(KEY); } catch (e) {}
  if (choice === 'granted') { loadAnalytics(); return; }
  if (choice === 'denied') { return; }

  // Première visite : on affiche le bandeau.
  var css = '.cip-consent{position:fixed;left:16px;right:16px;bottom:16px;z-index:9999;max-width:880px;margin:0 auto;background:rgba(14,19,34,.97);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.16);border-radius:16px;padding:16px 18px;box-shadow:0 14px 44px -12px rgba(0,0,0,.7);font-family:Manrope,system-ui,sans-serif;}'
    + '.cip-consent .cip-c-in{display:flex;gap:16px;align-items:center;flex-wrap:wrap;justify-content:space-between;}'
    + '.cip-consent p{margin:0;color:#c4cbdb;font-size:13.5px;line-height:1.6;flex:1;min-width:240px;}'
    + '.cip-consent a{color:#22d3ee;text-decoration:none;}.cip-consent a:hover{text-decoration:underline;}'
    + '.cip-consent .cip-c-btns{display:flex;gap:10px;flex:none;}'
    + '.cip-consent button{cursor:pointer;font-family:inherit;font-weight:700;font-size:13.5px;border-radius:30px;padding:10px 20px;}'
    + '.cip-consent .cip-c-no{background:transparent;color:#e7ecf6;border:1px solid rgba(255,255,255,.22);}'
    + '.cip-consent .cip-c-yes{background:linear-gradient(120deg,#22d3ee,#a855f7);color:#08111f;border:none;}'
    + '@media(max-width:560px){.cip-consent .cip-c-in{flex-direction:column;align-items:stretch;}.cip-consent .cip-c-btns{justify-content:flex-end;}}';
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var bar = document.createElement('div');
  bar.className = 'cip-consent';
  bar.setAttribute('role', 'dialog');
  bar.setAttribute('aria-label', 'Consentement aux cookies');
  var toolNames = ['Google Analytics', 'Ahrefs'];
  if (FB_PIXEL_ID) toolNames.push('Meta (Facebook)');
  var toolList = toolNames.length > 1
    ? toolNames.slice(0, -1).join(', ') + ' &amp; ' + toolNames[toolNames.length - 1]
    : toolNames[0];
  bar.innerHTML = '<div class="cip-c-in">'
    + '<p>🍪 Ce site utilise des outils de mesure d’audience (' + toolList + ') pour comprendre sa fréquentation. Rien n’est chargé sans votre accord — le site fonctionne dans les deux cas. <a href="/confidentialite.html">En savoir plus</a>.</p>'
    + '<div class="cip-c-btns">'
    + '<button type="button" class="cip-c-no">Refuser</button>'
    + '<button type="button" class="cip-c-yes">Accepter</button>'
    + '</div></div>';

  function done(v) {
    try { localStorage.setItem(KEY, v); } catch (e) {}
    if (bar.parentNode) bar.parentNode.removeChild(bar);
    if (v === 'granted') loadAnalytics();
  }

  function mount() {
    document.body.appendChild(bar);
    bar.querySelector('.cip-c-yes').addEventListener('click', function () { done('granted'); });
    bar.querySelector('.cip-c-no').addEventListener('click', function () { done('denied'); });
  }

  if (document.body) { mount(); }
  else { document.addEventListener('DOMContentLoaded', mount); }
})();
