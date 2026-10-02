/* lead-form.js — formulaires de contact du site (accueil, configurateur, tiroir « Devis express »).
   Envoi JSON vers le Worker Cloudflare /contact (anti-robot Cloudflare Turnstile + honeypot),
   puis redirection vers merci.html?ok=1&src=<origine> (conversion comptée une seule fois).
   Turnstile n'est chargé qu'à la première interaction avec un formulaire. */
(function () {
  'use strict';
  var ENDPOINT = 'https://main.francois-leterrier-cmw.workers.dev/contact';
  var MERCI = 'https://francoisleterrier.fr/merci.html?ok=1';
  var SITEKEY = '0x4AAAAAAEIrWHh-v_dU4c7P';
  var TEL = '<a href="tel:+33698200208" style="color:inherit;text-decoration:underline;">06 98 20 02 08</a>';
  var MAIL = '<a href="mailto:francois&#46;leterrier&#46;cmw&#64;gmail&#46;com" style="color:inherit;text-decoration:underline;">francois&#46;leterrier&#46;cmw&#64;gmail&#46;com</a>';
  var loading = false, ready = false, queue = [];

  function forms() { return document.querySelectorAll('form[data-fl-lead]'); }
  function ensureTurnstile(cb) {
    if (window.turnstile && typeof window.turnstile.render === 'function') { ready = true; cb(); return; }
    queue.push(cb);
    if (loading) return; loading = true;
    window.flTurnstileReady = function () { ready = true; var q = queue; queue = []; q.forEach(function (f) { try { f(); } catch (_) {} }); };
    if (document.querySelector('script[src*="turnstile/v0/api.js"]')) { var t = setInterval(function () { if (window.turnstile && window.turnstile.render) { clearInterval(t); window.flTurnstileReady(); } }, 200); return; }
    var s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=flTurnstileReady';
    s.async = true; s.defer = true; document.head.appendChild(s);
  }
  function mount(f) {
    if (!f || f._flMounted) return; f._flMounted = true;
    var box = f.querySelector('.fl-ts');
    if (!box) { box = document.createElement('div'); box.className = 'fl-ts'; var b = f.querySelector('button[type=submit]'); if (b && b.parentNode) b.parentNode.insertBefore(box, b); else f.appendChild(box); }
    box.style.margin = '4px 0 14px';
    ensureTurnstile(function () { try { f._flWidget = window.turnstile.render(box, { sitekey: SITEKEY, theme: 'dark', language: 'fr' }); } catch (_) {} });
  }
  function token(f) { try { if (window.turnstile && f._flWidget !== undefined) return window.turnstile.getResponse(f._flWidget) || ''; } catch (_) {} var el = f.querySelector('[name="cf-turnstile-response"]'); return el ? (el.value || '') : ''; }
  function reset(f) { try { if (window.turnstile && f._flWidget !== undefined) window.turnstile.reset(f._flWidget); } catch (_) {} }
  function v(f, n) { var el = f.querySelector('[name="' + n + '"]'); if (!el) return ''; if (el.type === 'radio') { var c = f.querySelector('[name="' + n + '"]:checked'); return c ? c.value : ''; } return (el.value || '').trim(); }
  function note(f, html) {
    var box = f._flNote;
    if (!box) { box = document.createElement('p'); box.setAttribute('role', 'alert'); box.style.cssText = 'font-size:13.5px;line-height:1.6;margin:2px 0 12px;padding:10px 12px;border-radius:10px;background:rgba(255,110,110,.12);color:#ffb3b3;'; var b = f.querySelector('button[type=submit]'); if (b && b.parentNode) b.parentNode.insertBefore(box, b); else f.appendChild(box); f._flNote = box; }
    box.innerHTML = html;
  }
  function submit(f) {
    if (f._flSending) return;
    var hp = f.querySelector('[name="botcheck"]'); if (hp && hp.checked) { window.location.href = MERCI; return; }
    var email = v(f, 'email'); if (!email) { note(f, 'Indiquez votre e-mail pour que je puisse vous répondre.'); return; }
    var tk = token(f);
    if (!tk) { mount(f); note(f, 'Vérification anti-robot en cours… patientez une seconde puis réessayez.'); reset(f); return; }
    var src = f.getAttribute('data-fl-src') || 'site';
    var prefix = f.getAttribute('data-fl-prefix') || '';
    var besoin = v(f, 'besoin'); if (prefix) besoin = prefix + (besoin ? ' — ' + besoin : '');
    var msg = v(f, 'message');
    var est = v(f, 'Estimation'), cfg = v(f, 'Configuration');
    if (est || cfg) msg += '\n\n' + (est ? 'Estimation : ' + est : '') + (est && cfg ? ' | ' : '') + (cfg ? 'Configuration : ' + cfg : '');
    f._flSending = true;
    var btn = f.querySelector('button[type=submit]'); var label = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = 'Envoi…'; }
    var payload = JSON.stringify({ nom: v(f, 'name') || v(f, 'nom'), email: email, tel: v(f, 'phone') || v(f, 'tel'), besoin: besoin, message: msg, token: tk });
    function fail(html) { f._flSending = false; if (btn) { btn.disabled = false; btn.innerHTML = label; } reset(f); note(f, html); }
    fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: payload })
      .then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
      .then(function (d) {
        if (d && d.ok) { window.location.href = MERCI + '&src=' + encodeURIComponent(src); return; }
        if (d && d.error === 'captcha') fail('La vérification anti-robot n\'a pas abouti. Merci de réessayer.');
        else if (d && d.error === 'email') fail('Cet e-mail ne semble pas valide. Vérifiez-le, ou appelez-moi au ' + TEL + '.');
        else fail('Envoi momentanément indisponible. Appelez-moi au ' + TEL + ' ou écrivez à ' + MAIL + '.');
      })
      .catch(function () { fail('Connexion interrompue. Réessayez, ou appelez-moi au ' + TEL + '.'); });
  }
  document.addEventListener('submit', function (e) { var f = e.target; if (f && f.matches && f.matches('form[data-fl-lead]')) { e.preventDefault(); submit(f); } }, true);
  function onInteract(e) { var f = e.target && e.target.closest ? e.target.closest('form[data-fl-lead]') : null; if (f) mount(f); }
  document.addEventListener('focusin', onInteract, true);
  document.addEventListener('pointerdown', onInteract, true);
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (x) { if (x.isIntersecting) { mount(x.target); io.unobserve(x.target); } }); }, { rootMargin: '200px' });
    Array.prototype.forEach.call(forms(), function (f) { io.observe(f); });
  }
})();
