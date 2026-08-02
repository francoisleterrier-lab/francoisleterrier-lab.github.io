/* =====================================================================
   FL — Assistant de pré-qualification à réponses guidées (sans IA, statique).
   Aucune dépendance, aucun backend, aucune donnée envoyée : de simples
   parcours guidés qui orientent le visiteur (site / réseaux / faire-part /
   devis) et le poussent vers le configurateur, les tarifs ou le contact.
   Inclusion : balise script src="/assistant.js" defer (en fin de body).
   Respecte prefers-reduced-motion et le clavier.
   ===================================================================== */
(function () {
  "use strict";
  if (window.__flAssistant) return; window.__flAssistant = true;
  var RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var API = "https://main.francois-leterrier-cmw.workers.dev";
  var history = [];
  function escHtml(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function linkify(s) { return escHtml(s).replace(/\/(audit|generateur|configurateur|contact|barometre|tarifs)\.html/g, function (m) { return '<a href="' + m + '" style="color:#8fe6f0;font-weight:700">' + m + "</a>"; }); }

  /* Raccourcis d'action toujours proposés sous une réponse libre du LLM (conversion). */
  var QUICK = [
    { t: "🔍 Auditer mon site", href: "/audit.html" },
    { t: "🎨 Générer ma maquette", href: "/generateur.html" },
    { t: "📅 Réserver un RDV", cal: true },
    { t: "📞 Être rappelé", capture: true }
  ];

  /* ---------- parcours scriptés ---------- */
  var NODES = {
    start: {
      bot: "Bonjour 👋 Je suis l'assistant du site. Choisissez ci-dessous, ou <b>écrivez-moi directement</b> votre question en bas&nbsp;:",
      opts: [
        { t: "Créer un site internet", go: "site" },
        { t: "Gérer mes réseaux sociaux", go: "reseaux" },
        { t: "Les deux", go: "deux" },
        { t: "Un faire-part digital", go: "fairepart" },
        { t: "Une question rapide", go: "faq" },
        { t: "📞 Appeler François", href: "tel:+33698200208" }
      ]
    },
    site: {
      bot: "Bon choix 🖥️ Un site vitrine démarre à <b>590&nbsp;€</b> (1 page) ou <b>1&nbsp;690&nbsp;€</b> (jusqu'à 5 pages), <b>référencement local inclus</b>. Je peux vous montrer un exemple dans votre secteur, ou chiffrer votre projet en 30&nbsp;secondes.",
      opts: [
        { t: "🔎 Voir un exemple de mon métier", go: "metier" },
        { t: "⚙️ Chiffrer mon projet", href: "/configurateur.html" },
        { t: "Voir tous les tarifs", href: "/tarifs.html" },
        { t: "Être recontacté", go: "contact" },
        { t: "↩ Retour", go: "start" }
      ]
    },
    metier: {
      bot: "Super — quel est votre secteur&nbsp;? Je vous montre un <b>exemple concret</b> (un vrai modèle de démonstration).",
      opts: [
        { t: "🍷 Restaurant / bar", href: "/modeles/restaurant.html" },
        { t: "🔧 Artisan / BTP", href: "/modeles/artisan.html" },
        { t: "🛍️ Commerce / boutique", href: "/modeles/commerce.html" },
        { t: "🧘 Bien-être / thérapie", href: "/modeles/bien-etre.html" },
        { t: "💇 Coiffure / beauté", href: "/modeles/coiffure.html" },
        { t: "Autre métier", go: "metier_autre" },
        { t: "↩ Retour", go: "site" }
      ]
    },
    metier_autre: {
      bot: "Pas de souci&nbsp;: chaque site est <b>sur-mesure</b>, quel que soit le métier. On part de votre activité, vos couleurs et vos objectifs. Vous pouvez parcourir tous les modèles ou chiffrer directement votre projet.",
      opts: [
        { t: "Voir tous les modèles", href: "/modeles/" },
        { t: "⚙️ Chiffrer mon projet", href: "/configurateur.html" },
        { t: "Être recontacté", go: "contact" },
        { t: "↩ Retour", go: "start" }
      ]
    },
    reseaux: {
      bot: "La gestion de vos réseaux (Facebook, Instagram, Google Business) démarre à <b>290&nbsp;€/mois</b>, <b>sans engagement</b>. La formule Croissance (490&nbsp;€/mois) est la plus choisie. Vous validez chaque contenu avant publication.",
      opts: [
        { t: "Voir les formules", href: "/tarifs.html" },
        { t: "⚙️ Estimer mon projet", href: "/configurateur.html" },
        { t: "Être recontacté", go: "contact" },
        { t: "↩ Retour", go: "start" }
      ]
    },
    deux: {
      bot: "Excellent — c'est justement le cœur du métier&nbsp;: un <b>site pensé pour être trouvé</b> + des <b>réseaux animés régulièrement</b>, par le même interlocuteur. Le configurateur calcule le tout (site + réseaux) en direct.",
      opts: [
        { t: "⚙️ Composer mon projet", href: "/configurateur.html" },
        { t: "Voir les tarifs", href: "/tarifs.html" },
        { t: "Être recontacté", go: "contact" },
        { t: "↩ Retour", go: "start" }
      ]
    },
    fairepart: {
      bot: "Le <b>faire-part digital</b> (mini-site d'invitation, RSVP, plan…) démarre à <b>290&nbsp;€</b>. Élégant, installable, partageable en un lien — bien plus vivant qu'un carton papier.",
      opts: [
        { t: "Découvrir le faire-part", href: "/faire-part-digital.html" },
        { t: "🔎 Voir un exemple", href: "/modeles/faire-part.html" },
        { t: "Être recontacté", go: "contact" },
        { t: "↩ Retour", go: "start" }
      ]
    },
    faq: {
      bot: "Bien sûr — que voulez-vous savoir&nbsp;?",
      opts: [
        { t: "Combien ça coûte ?", go: "faq_prix" },
        { t: "Quels délais ?", go: "faq_delais" },
        { t: "Et le référencement ?", go: "faq_seo" },
        { t: "Puis-je le modifier moi-même ?", go: "faq_autonomie" },
        { t: "Faut-il s'engager ?", go: "faq_engagement" },
        { t: "Quelle zone ?", go: "faq_zone" },
        { t: "↩ Retour", go: "start" }
      ]
    },
    faq_prix: {
      bot: "En transparence&nbsp;: <b>site vitrine dès 590&nbsp;€</b> (1 page) ou <b>1&nbsp;690&nbsp;€</b> (jusqu'à 5 pages), <b>réseaux dès 290&nbsp;€/mois</b> sans engagement, <b>faire-part digital dès 290&nbsp;€</b>. Référencement local inclus sur les sites. Le configurateur chiffre votre cas précis.",
      opts: [
        { t: "⚙️ Chiffrer mon projet", href: "/configurateur.html" },
        { t: "Voir tous les tarifs", href: "/tarifs.html" },
        { t: "Autre question", go: "faq" },
        { t: "↩ Retour", go: "start" }
      ]
    },
    faq_seo: {
      bot: "Chaque site est livré <b>optimisé pour Google</b> (structure, vitesse, référencement local, fiche Google Business). L'objectif&nbsp;: être trouvé par vos clients autour de chez vous. Je peux aussi gérer votre visibilité dans la durée.",
      opts: [
        { t: "En savoir plus", href: "/referencement-seo.html" },
        { t: "⚙️ Chiffrer mon projet", href: "/configurateur.html" },
        { t: "Autre question", go: "faq" },
        { t: "↩ Retour", go: "start" }
      ]
    },
    faq_autonomie: {
      bot: "Oui 🙂 Le site est pensé pour <b>évoluer avec vous</b>, et je reste disponible pour les modifications. On peut aussi prévoir un forfait maintenance si vous préférez être tranquille — on choisit ensemble ce qui vous convient.",
      opts: [
        { t: "Voir les tarifs", href: "/tarifs.html" },
        { t: "Être recontacté", go: "contact" },
        { t: "Autre question", go: "faq" },
        { t: "↩ Retour", go: "start" }
      ]
    },
    faq_delais: {
      bot: "Comptez environ <b>1 semaine</b> pour une landing page, <b>2–3 semaines</b> pour un site vitrine, <b>3–5 semaines</b> pour une application. Pour les réseaux, ça démarre dès la validation de la formule.",
      opts: [
        { t: "⚙️ Chiffrer mon projet", href: "/configurateur.html" },
        { t: "Autre question", go: "faq" },
        { t: "↩ Retour", go: "start" }
      ]
    },
    faq_engagement: {
      bot: "Non 🙂 Les formules réseaux sont <b>sans engagement</b>, facturées au mois et résiliables (préavis 30&nbsp;jours). Vous gardez le contrôle et validez chaque contenu avant publication.",
      opts: [
        { t: "Voir les tarifs", href: "/tarifs.html" },
        { t: "Autre question", go: "faq" },
        { t: "↩ Retour", go: "start" }
      ]
    },
    faq_zone: {
      bot: "Basé à <b>Lavernose-Lacasse</b> (Sud-Toulousain, 31410), je travaille sur place autour de Toulouse <b>et à distance partout en France</b> (visio + livraison en ligne).",
      opts: [
        { t: "Être recontacté", go: "contact" },
        { t: "Autre question", go: "faq" },
        { t: "↩ Retour", go: "start" }
      ]
    },
    contact: {
      bot: "Avec plaisir. Le plus simple&nbsp;: laissez-moi vos coordonnées ici, François vous recontacte (sous 48h en moyenne, sans engagement).",
      opts: [
        { t: "📞 Être rappelé", cap: true },
        { t: "✍️ Formulaire complet", href: "/contact.html" },
        { t: "📅 Réserver un créneau", href: "https://calendly.com/fl-conceptimmoplus/30min", ext: true },
        { t: "↩ Retour", go: "start" }
      ]
    }
  };

  /* ---------- styles ---------- */
  var css = ''
    + '#fl-as-launch{position:fixed;right:18px;bottom:18px;z-index:95;display:inline-flex;align-items:center;justify-content:center;'
    + 'width:56px;height:56px;padding:0;border:0;border-radius:50%;cursor:pointer;'
    + 'color:#08111f;background:linear-gradient(90deg,#28c8dd 0%,#7c3aed 52%,#e05bc8 100%);'
    + 'box-shadow:0 14px 34px -10px rgba(124,58,237,.7),0 0 22px -8px rgba(40,200,221,.7);transition:transform .2s}'
    + '#fl-as-launch:hover{transform:translateY(-2px)}'
    + '#fl-as-launch svg{width:22px;height:22px;flex:none}'
    + '#fl-as-launch .fl-as-lbl{display:none}'
    + '#fl-as-launch .fl-as-close-i{display:none}'
    + '#fl-as-launch.open .fl-as-open-i{display:none}#fl-as-launch.open .fl-as-close-i{display:block}'
    + '#fl-as-panel{position:fixed;right:18px;bottom:82px;z-index:95;width:360px;max-width:calc(100vw - 36px);'
    + 'height:520px;max-height:calc(100vh - 120px);display:none;flex-direction:column;overflow:hidden;'
    + 'background:#0d0a1c;border:1px solid rgba(143,230,240,.22);border-radius:18px;'
    + 'box-shadow:0 30px 70px rgba(0,0,0,.6);font-family:"Montserrat",system-ui,sans-serif}'
    + '#fl-as-panel.show{display:flex}'
    + '#fl-as-panel .fl-as-head{display:flex;align-items:center;gap:11px;padding:15px 16px;border-bottom:1px solid rgba(143,230,240,.14);background:rgba(255,255,255,.02)}'
    + '#fl-as-panel .fl-as-av{width:38px;height:38px;border-radius:50%;flex:none;background:linear-gradient(90deg,#28c8dd,#7c3aed,#e05bc8);display:flex;align-items:center;justify-content:center;font-size:19px}'
    + '#fl-as-panel .fl-as-ht b{display:block;color:#fff;font-size:14px;font-weight:700}'
    + '#fl-as-panel .fl-as-ht span{display:block;color:#8fe6f0;font-size:11px;font-weight:600;letter-spacing:.02em}'
    + '#fl-as-panel .fl-as-call{margin-left:auto;display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;flex:none;border-radius:50%;background:rgba(40,200,221,.14);border:1px solid rgba(143,230,240,.3);color:#8fe6f0;text-decoration:none;transition:.15s}'
    + '#fl-as-panel .fl-as-call:hover{background:rgba(40,200,221,.26);color:#fff}'
    + '#fl-as-panel .fl-as-call svg{width:17px;height:17px}'
    + '#fl-as-panel .fl-as-x{background:none;border:0;color:#b9b3c6;font-size:22px;line-height:1;cursor:pointer;padding:4px 6px}'
    + '#fl-as-panel .fl-as-x:hover{color:#fff}'
    + '#fl-as-body{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px}'
    + '.fl-as-msg{max-width:86%;padding:11px 14px;border-radius:14px;font-size:13.5px;line-height:1.55}'
    + '.fl-as-bot{align-self:flex-start;background:#17132b;border:1px solid rgba(143,230,240,.14);color:#e7e2f0;border-bottom-left-radius:4px}'
    + '.fl-as-bot b{color:#fff}'
    + '.fl-as-user{align-self:flex-end;background:linear-gradient(90deg,#28c8dd,#7c3aed);color:#08111f;font-weight:600;border-bottom-right-radius:4px}'
    + '.fl-as-opts{display:flex;flex-wrap:wrap;gap:8px;padding:2px 16px 16px}'
    + '.fl-as-chip{cursor:pointer;padding:9px 14px;border-radius:30px;background:rgba(255,255,255,.05);border:1.5px solid rgba(143,230,240,.28);'
    + 'color:#e7e2f0;font:inherit;font-size:13px;font-weight:600;transition:.15s;text-decoration:none;display:inline-block}'
    + '.fl-as-chip:hover{border-color:#28c8dd;color:#fff;background:rgba(40,200,221,.1)}'
    + '.fl-as-chip.cta{background:linear-gradient(90deg,#28c8dd,#7c3aed,#e05bc8);color:#08111f;border-color:transparent}'
    + '.fl-as-form{display:flex;gap:8px;padding:10px 12px 12px;border-top:1px solid rgba(143,230,240,.14)}'
    + '.fl-as-form input{flex:1;min-width:0;background:rgba(255,255,255,.05);border:1.5px solid rgba(143,230,240,.24);border-radius:22px;padding:10px 14px;color:#e7e2f0;font:inherit;font-size:13.5px}'
    + '.fl-as-form input:focus{outline:none;border-color:#28c8dd;box-shadow:0 0 0 3px rgba(40,200,221,.16)}'
    + '.fl-as-send{flex:none;width:40px;height:40px;border-radius:50%;border:0;cursor:pointer;background:linear-gradient(90deg,#28c8dd,#7c3aed);color:#08111f;font-size:15px;font-weight:800}'
    + '.fl-as-send[disabled]{opacity:.55;cursor:progress}'
    + '.fl-as-cap{display:flex;flex-direction:column;gap:8px;max-width:100%;width:100%}'
    + '.fl-as-ci{width:100%;box-sizing:border-box;background:rgba(255,255,255,.06);border:1.5px solid rgba(143,230,240,.24);border-radius:11px;padding:9px 12px;color:#f2ecf4;font:inherit;font-size:13px}'
    + '.fl-as-ci:focus{outline:none;border-color:#28c8dd;box-shadow:0 0 0 3px rgba(40,200,221,.16)}'
    + 'textarea.fl-as-ci{resize:vertical;min-height:38px}'
    + '.fl-as-cap-err{color:#ff8f8f;font-size:12px;font-weight:600}'
    + '.fl-as-cap-send{cursor:pointer;border:0;border-radius:24px;padding:10px 16px;font:inherit;font-weight:800;font-size:13px;color:#08111f;background:linear-gradient(90deg,#28c8dd,#7c3aed,#e05bc8)}'
    + '.fl-as-cap-send[disabled]{opacity:.6;cursor:progress}'
    + '.fl-as-typing span{display:inline-block;width:6px;height:6px;margin:0 1px;border-radius:50%;background:#8fe6f0;animation:fl-as-blink 1s infinite}'
    + '.fl-as-typing span:nth-child(2){animation-delay:.2s}.fl-as-typing span:nth-child(3){animation-delay:.4s}'
    + '@keyframes fl-as-blink{0%,60%,100%{opacity:.3}30%{opacity:1}}'
    + '@media(max-width:760px){#fl-as-panel{bottom:84px;height:64vh}}'
    + (RM ? '' : '#fl-as-panel.show{animation:fl-as-in .22s ease}@keyframes fl-as-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}');

  /* ---------- construction du DOM ---------- */
  function el(html) { var d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }

  function build() {
    var style = document.createElement('style'); style.id = 'fl-as-css'; style.textContent = css;
    document.head.appendChild(style);

    var launch = el('<button id="fl-as-launch" aria-haspopup="dialog" aria-expanded="false" aria-controls="fl-as-panel" aria-label="Une question ? Ouvrir l\'assistant du site">'
      + '<svg class="fl-as-open-i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'
      + '<svg class="fl-as-close-i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>'
      + '<span class="fl-as-lbl">Une question&nbsp;?</span></button>');

    var panel = el('<div id="fl-as-panel" role="dialog" aria-modal="false" aria-label="Assistant à réponses guidées">'
      + '<div class="fl-as-head"><div class="fl-as-av" aria-hidden="true">💬</div>'
      + '<div class="fl-as-ht"><b>Assistant du site</b><span>Assistant IA · sans engagement</span></div>'
      + '<a class="fl-as-call" href="tel:+33698200208" aria-label="Appeler le 06 98 20 02 08" title="Appeler le 06 98 20 02 08">'
      + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.5 2.7.6a2 2 0 0 1 1.7 2z"/></svg></a>'
      + '<button class="fl-as-x" aria-label="Fermer l\'assistant">×</button></div>'
      + '<div id="fl-as-body" aria-live="polite"></div>'
      + '<div class="fl-as-opts" id="fl-as-opts"></div>'
      + '<form id="fl-as-form" class="fl-as-form"><input id="fl-as-input" type="text" placeholder="Écrivez votre question…" autocomplete="off" aria-label="Votre message"><button type="submit" class="fl-as-send" aria-label="Envoyer">➤</button></form></div>');

    document.body.appendChild(launch);
    document.body.appendChild(panel);
    return { launch: launch, panel: panel };
  }

  var ui, body, opts, opened = false, started = false;

  function addMsg(html, who) {
    var m = document.createElement('div');
    m.className = 'fl-as-msg ' + (who === 'user' ? 'fl-as-user' : 'fl-as-bot');
    m.innerHTML = html;
    body.appendChild(m);
    body.scrollTop = body.scrollHeight;
  }

  function render(nodeKey) {
    var node = NODES[nodeKey]; if (!node) return;
    addMsg(node.bot, 'bot');
    opts.innerHTML = '';
    node.opts.forEach(function (o) {
      var chip;
      if (o.href) {
        chip = document.createElement('a');
        chip.href = o.href;
        chip.className = 'fl-as-chip cta';
        if (o.ext) { chip.target = '_blank'; chip.rel = 'noopener'; }
      } else if (o.cap) {
        chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'fl-as-chip cta';
        chip.addEventListener('click', function () { renderCapture(); });
      } else {
        chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'fl-as-chip';
        chip.addEventListener('click', function () {
          addMsg(o.t, 'user');
          opts.innerHTML = '';
          setTimeout(function () { render(o.go); }, RM ? 0 : 180);
        });
      }
      chip.innerHTML = o.t;
      opts.appendChild(chip);
    });
    body.scrollTop = body.scrollHeight;
  }

  /* Affiche les raccourcis de conversion sous une réponse libre. */
  function showQuick() {
    opts.innerHTML = '';
    QUICK.forEach(function (o) {
      var chip;
      if (o.cal || o.capture) {
        chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'fl-as-chip' + (o.capture ? ' cta' : '');
        chip.addEventListener('click', function () {
          if (o.capture) { renderCapture(); return; }
          if (typeof window.flOpenCalendly === 'function') window.flOpenCalendly();
          else location.href = '/contact.html';
        });
      } else {
        chip = document.createElement('a');
        chip.href = o.href;
        chip.className = 'fl-as-chip';
      }
      chip.innerHTML = o.t;
      opts.appendChild(chip);
    });
  }

  /* Récapitule le fil pour donner le contexte à François. */
  function buildConvo() {
    return history.slice(-8).map(function (m) {
      return (m.role === 'user' ? 'Vous : ' : 'Assistant : ') + String(m.content || '').slice(0, 300);
    }).join('\n');
  }

  /* Formulaire « Être rappelé » injecté dans le fil : nom + e-mail (+ tél + demande) → /admin. */
  function renderCapture() {
    opts.innerHTML = '';
    if (body.querySelector('.fl-as-cap')) { body.querySelector('.fl-as-cap input').focus(); return; }
    addMsg("Avec plaisir 🙂 Laissez-moi vos coordonnées, François vous recontacte (réponse sous 48&nbsp;h en moyenne).", 'bot');
    var card = document.createElement('form');
    card.className = 'fl-as-msg fl-as-bot fl-as-cap';
    card.setAttribute('novalidate', '');
    card.innerHTML =
      '<input class="fl-as-ci" type="text" name="nom" placeholder="Votre nom" autocomplete="name">' +
      '<input class="fl-as-ci" type="email" name="email" placeholder="Votre e-mail *" autocomplete="email" required>' +
      '<input class="fl-as-ci" type="tel" name="tel" placeholder="Téléphone (facultatif)" autocomplete="tel">' +
      '<textarea class="fl-as-ci" name="message" rows="2" placeholder="Votre besoin en une phrase (facultatif)"></textarea>' +
      '<div class="fl-as-cap-err" hidden></div>' +
      '<button type="submit" class="fl-as-cap-send">Être rappelé →</button>';
    body.appendChild(card);
    body.scrollTop = body.scrollHeight;
    var err = card.querySelector('.fl-as-cap-err');
    card.querySelector('input[name="email"]').focus();
    card.addEventListener('submit', async function (e) {
      e.preventDefault();
      var nom = card.querySelector('[name="nom"]').value.trim();
      var email = card.querySelector('[name="email"]').value.trim();
      var tel = card.querySelector('[name="tel"]').value.trim();
      var message = card.querySelector('[name="message"]').value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        err.textContent = "Merci d'indiquer un e-mail valide."; err.hidden = false; return;
      }
      err.hidden = true;
      var btn = card.querySelector('.fl-as-cap-send');
      btn.disabled = true; btn.textContent = 'Envoi…';
      var okSent = false;
      try {
        var ctrl = new AbortController(), to = setTimeout(function () { ctrl.abort(); }, 15000);
        var r = await fetch(API + '/lead', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: 'assistant', nom: nom, email: email, tel: tel, message: message, convo: buildConvo() }),
          signal: ctrl.signal
        });
        clearTimeout(to);
        var j = await r.json();
        okSent = !!(j && j.ok);
      } catch (_) {}
      card.remove();
      if (okSent) {
        addMsg("C'est noté, merci " + (nom ? escHtml(nom.split(' ')[0]) : '') + "&nbsp;! 🎉 François vous recontacte très vite. En attendant, vous pouvez tester l'audit gratuit ou générer une maquette.", 'bot');
      } else {
        addMsg("Oups, l'envoi n'a pas abouti. Vous pouvez réessayer, ou passer par la page <a href=\"/contact.html\" style=\"color:#8fe6f0;font-weight:700\">contact</a> / m'appeler au 06&nbsp;98&nbsp;20&nbsp;02&nbsp;08.", 'bot');
      }
      showQuick();
    });
  }

  async function sendText() {
    var input = ui.panel.querySelector('#fl-as-input'), send = ui.panel.querySelector('.fl-as-send');
    var text = (input.value || '').trim();
    if (!text) return;
    input.value = '';
    addMsg(escHtml(text), 'user');
    opts.innerHTML = '';
    history.push({ role: 'user', content: text });
    if (send) send.disabled = true;
    var typing = document.createElement('div');
    typing.className = 'fl-as-msg fl-as-bot fl-as-typing';
    typing.innerHTML = '<span></span><span></span><span></span>';
    body.appendChild(typing); body.scrollTop = body.scrollHeight;
    var reply = '';
    try {
      var ctrl = new AbortController(), to = setTimeout(function () { ctrl.abort(); }, 22000);
      var r = await fetch(API + '/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text, history: history.slice(-6) }), signal: ctrl.signal });
      clearTimeout(to);
      var j = await r.json();
      reply = (j && j.reply) || '';
    } catch (_) {}
    typing.remove();
    if (!reply) reply = "Désolé, je n'ai pas pu répondre à l'instant. Vous pouvez tester l'audit gratuit (/audit.html), le générateur (/generateur.html), ou demander le diagnostic offert (/contact.html).";
    addMsg(linkify(reply), 'bot');
    history.push({ role: 'assistant', content: reply });
    showQuick();
    if (send) send.disabled = false;
    if (input) input.focus();
  }

  function open() {
    ui.panel.classList.add('show');
    ui.launch.classList.add('open');
    ui.launch.setAttribute('aria-expanded', 'true');
    opened = true;
    if (!started) { started = true; render('start'); }
    var x = ui.panel.querySelector('.fl-as-x'); if (x) x.focus();
  }
  function close() {
    ui.panel.classList.remove('show');
    ui.launch.classList.remove('open');
    ui.launch.setAttribute('aria-expanded', 'false');
    opened = false;
    ui.launch.focus();
  }

  function init() {
    ui = build();
    body = ui.panel.querySelector('#fl-as-body');
    opts = ui.panel.querySelector('#fl-as-opts');
    ui.launch.addEventListener('click', function () { opened ? close() : open(); });
    ui.panel.querySelector('.fl-as-x').addEventListener('click', close);
    var form = ui.panel.querySelector('#fl-as-form');
    if (form) form.addEventListener('submit', function (e) { e.preventDefault(); sendText(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && opened) close(); });
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
