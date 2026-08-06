/* =====================================================================
   FL — FX premium (JS minimal) : reflet/spotlight qui suit le curseur
   dans les cartes. UN seul écouteur (délégué au document), passif.
   Coupé si prefers-reduced-motion ou pointeur non-fin (mobile/tactile).
   N'ajoute qu'une classe décorative + 2 variables CSS. Zéro layout.
   ===================================================================== */
(function () {
  'use strict';
  var mm = window.matchMedia;
  if (!mm) return;
  var RM = mm('(prefers-reduced-motion: reduce)').matches;
  var FINE = mm('(hover:hover) and (pointer:fine)').matches;
  if (RM || !FINE) return;

  var SEL = '.svc,.why-card,.tm-card:not(.feature),.avis-card';
  var cards = document.querySelectorAll(SEL);
  if (!cards.length) return;
  Array.prototype.forEach.call(cards, function (c) { c.classList.add('fl-glare'); });

  var raf = 0, pend = null;
  document.addEventListener('pointermove', function (e) {
    var t = e.target;
    var c = t && t.closest ? t.closest('.fl-glare') : null;
    if (!c) return;
    pend = { c: c, x: e.clientX, y: e.clientY };
    if (raf) return;
    raf = requestAnimationFrame(function () {
      raf = 0;
      if (!pend) return;
      var r = pend.c.getBoundingClientRect();
      pend.c.style.setProperty('--mx', ((pend.x - r.left) / r.width * 100).toFixed(1) + '%');
      pend.c.style.setProperty('--my', ((pend.y - r.top) / r.height * 100).toFixed(1) + '%');
    });
  }, { passive: true });
})();
