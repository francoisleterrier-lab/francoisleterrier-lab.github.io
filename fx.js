/* =====================================================================
   FL — FX premium (vanilla, léger, a11y).
   1) Reflet/spotlight au curseur dans les cartes (délégué, passif).
   2) Halo d'ambiance qui suit la souris.
   3) Constellation vivante en fond, réactive à la souris.
   Coupé si prefers-reduced-motion ou pointeur non-fin (mobile/tactile).
   La constellation se met en pause quand l'onglet n'est pas visible.
   ===================================================================== */
(function () {
  'use strict';
  var mm = window.matchMedia;
  if (!mm) return;
  var RM = mm('(prefers-reduced-motion: reduce)').matches;
  var FINE = mm('(hover:hover) and (pointer:fine)').matches;
  if (RM || !FINE) return;

  /* ---------- 1. Reflet au curseur dans les cartes ---------- */
  var cards = document.querySelectorAll('.svc,.why-card,.tm-card:not(.feature),.avis-card');
  Array.prototype.forEach.call(cards, function (c) { c.classList.add('fl-glare'); });
  var graf = 0, gpend = null;
  if (cards.length) document.addEventListener('pointermove', function (e) {
    var t = e.target, c = t && t.closest ? t.closest('.fl-glare') : null;
    if (!c) return;
    gpend = { c: c, x: e.clientX, y: e.clientY };
    if (graf) return;
    graf = requestAnimationFrame(function () {
      graf = 0; if (!gpend) return;
      var r = gpend.c.getBoundingClientRect();
      gpend.c.style.setProperty('--mx', ((gpend.x - r.left) / r.width * 100).toFixed(1) + '%');
      gpend.c.style.setProperty('--my', ((gpend.y - r.top) / r.height * 100).toFixed(1) + '%');
    });
  }, { passive: true });

  /* ---------- 2. Halo d'ambiance ---------- */
  var halo = document.createElement('div');
  halo.className = 'fl-halo'; halo.setAttribute('aria-hidden', 'true');
  document.body.appendChild(halo);
  var hx = innerWidth / 2, hy = innerHeight / 2, tx = hx, ty = hy, hshown = false;

  /* ---------- 3. Constellation ---------- */
  var cv = document.createElement('canvas');
  cv.className = 'fl-constel'; cv.setAttribute('aria-hidden', 'true');
  document.body.appendChild(cv);
  var ctx = cv.getContext('2d'), pts = [], W = 0, H = 0, DPR = Math.min(devicePixelRatio || 1, 2);
  var COLS = [[40, 200, 221], [124, 92, 255], [224, 91, 200]];
  var mx = -999, my = -999;

  function resize() {
    W = innerWidth; H = innerHeight;
    cv.width = W * DPR; cv.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    var N = Math.min(70, Math.round(W * H / 26000));
    pts = [];
    for (var i = 0; i < N; i++) pts.push({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.22, vy: (Math.random() - 0.5) * 0.22,
      r: Math.random() * 1.4 + 0.6, c: COLS[i % 3]
    });
  }

  function frame() {
    if (document.hidden) { running = false; return; }
    ctx.clearRect(0, 0, W, H);
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      // légère attraction vers la souris
      if (mx > -900) {
        var ddx = mx - p.x, ddy = my - p.y, dm = ddx * ddx + ddy * ddy;
        if (dm < 34000) { p.vx += ddx / dm * 6; p.vy += ddy / dm * 6; }
      }
      p.vx *= 0.985; p.vy *= 0.985;
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > W) p.vx *= -1;
      if (p.y < 0 || p.y > H) p.vy *= -1;
      p.x = Math.max(0, Math.min(W, p.x)); p.y = Math.max(0, Math.min(H, p.y));
      for (var j = i + 1; j < pts.length; j++) {
        var q = pts[j], dx = p.x - q.x, dy = p.y - q.y, d = Math.sqrt(dx * dx + dy * dy);
        if (d < 128) {
          ctx.strokeStyle = 'rgba(' + p.c[0] + ',' + p.c[1] + ',' + p.c[2] + ',' + (1 - d / 128) * 0.22 + ')';
          ctx.lineWidth = 0.6;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
        }
      }
    }
    for (var k = 0; k < pts.length; k++) {
      var pt = pts[k];
      ctx.fillStyle = 'rgba(' + pt.c[0] + ',' + pt.c[1] + ',' + pt.c[2] + ',.85)';
      ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.r, 0, 6.2832); ctx.fill();
    }
    requestAnimationFrame(frame);
  }

  var running = false;
  function start() { if (!running) { running = true; requestAnimationFrame(frame); } }

  /* pointeur global : halo + constellation */
  var hraf = 0;
  addEventListener('mousemove', function (e) {
    tx = e.clientX; ty = e.clientY; mx = e.clientX; my = e.clientY;
    if (!hshown) { halo.classList.add('on'); hshown = true; }
    if (!hraf) hraf = requestAnimationFrame(function () {
      hraf = 0; hx += (tx - hx) * 0.12; hy += (ty - hy) * 0.12;
      halo.style.transform = 'translate(' + hx + 'px,' + hy + 'px)';
    });
  }, { passive: true });
  addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) start(); });

  resize(); start();
})();
