/* =====================================================================
   FL — Devis instantané signable (Chantier 4).
   Affiche un devis (GET /devis?id) façon document, et permet de le signer
   électroniquement (POST /devis/sign). Impression → PDF.
   ===================================================================== */
(function () {
  "use strict";
  var API = "https://main.francois-leterrier-cmw.workers.dev";
  function $(s) { return document.querySelector(s); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function fmt(n) { return (Number(n) || 0).toLocaleString("fr-FR"); }
  function dfr(iso) { try { return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" }); } catch (_) { return ""; } }

  function ready(fn) { document.readyState !== "loading" ? fn() : document.addEventListener("DOMContentLoaded", fn); }
  ready(function () {
    var state = $("#dv-state"), doc = $("#dv-doc"), actions = $("#dv-actions");
    var id = new URLSearchParams(location.search).get("id");
    if (!id || !/^[a-f0-9]{6,40}$/i.test(id)) { state.innerHTML = "Lien de devis invalide."; return; }

    fetch(API + "/devis?id=" + encodeURIComponent(id)).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.ok || !j.devis) { state.innerHTML = "Ce devis n'est plus disponible. <a href=\"configurateur.html\" style=\"color:var(--cyan)\">Composer un nouveau projet →</a>"; return; }
      state.hidden = true; render(j.devis); actions.hidden = false;
    }).catch(function () { state.innerHTML = "Connexion impossible. Réessayez dans un instant."; });

    function render(dv) {
      var exp = "";
      try { var e = new Date(dv.ts); e.setDate(e.getDate() + (dv.validityDays || 30)); exp = e.toLocaleDateString("fr-FR"); } catch (_) {}
      var rows = (dv.items || []).map(function (it) { return "<tr><td>" + esc(it.label) + '</td><td class="r">' + fmt(it.amount) + " €</td></tr>"; }).join("");
      var cl = dv.client || {};
      var clientLine = [cl.nom, cl.ville].filter(Boolean).map(esc).join(" · ");
      var contact = [cl.email, cl.tel].filter(Boolean).map(esc).join(" · ");

      var sign = dv.status === "signed" && dv.signature
        ? '<div class="dv-signed"><div class="stamp">✅ Devis accepté &amp; signé</div>' +
          '<div class="who">' + esc(dv.signature.name) + "</div>" +
          '<div style="font-size:13px;color:#77727f">Bon pour accord le ' + dfr(dv.signature.date) + "</div>" +
          '<div class="dv-msg-out" style="color:#1c8a4a">Merci&nbsp;! Je reviens vers vous très vite pour lancer le projet.</div></div>'
        : '<div class="dv-sign"><h3>Bon pour accord</h3>' +
          '<p>Signez en ligne pour valider ce devis. C\'est un accord de principe, sans paiement — je vous recontacte pour démarrer.</p>' +
          '<div class="row"><input type="text" id="dv-name" placeholder="Votre nom et prénom" value="' + esc(cl.nom || "") + '" aria-label="Votre nom"></div>' +
          '<label class="dv-consent"><input type="checkbox" id="dv-ok"><span>Je certifie être la personne indiquée et j\'accepte ce devis (« bon pour accord »).</span></label>' +
          '<button class="dv-btn" id="dv-signbtn">✍️ Signer le devis</button>' +
          '<div class="dv-msg-out" id="dv-signmsg"></div></div>';

      doc.innerHTML =
        '<div class="devis-doc">' +
        '<div class="dv-top"><div class="dv-prov"><b>François Leterrier</b>Community Manager &amp; Création de site internet<br>Lavernose-Lacasse · 31410<br><a href="tel:+33698200208">06 98 20 02 08</a> · francois.leterrier.cmw@gmail.com</div>' +
        '<div class="dv-meta"><div class="t">DEVIS</div><div class="n">N° ' + esc(dv.id).toUpperCase() + "<br>Établi le " + dfr(dv.ts) + "</div></div></div>" +
        '<div class="dv-client"><div class="l">Établi pour</div><div class="v">' + (clientLine || "—") + (contact ? '<br><span style="color:#8a8594;font-size:13px">' + contact + "</span>" : "") + "</div></div>" +
        (dv.projet ? '<p style="margin:16px 0 0;font-size:14px;color:#55505f"><b>Projet :</b> ' + esc(dv.projet) + (dv.delay ? " — délai estimé " + esc(dv.delay) : "") + "</p>" : "") +
        '<table class="dv-items"><thead><tr><th>Désignation</th><th class="r">Montant</th></tr></thead><tbody>' + rows + "</tbody></table>" +
        '<div class="dv-tot"><div class="box">' +
        '<div class="row grand"><span>Total à régler</span><b>' + fmt(dv.total) + " €</b></div>" +
        (dv.monthly ? '<div class="row mo"><span>+ Réseaux sociaux (mensuel)</span><span>' + fmt(dv.monthly) + " €/mois</span></div>" : "") +
        "</div></div>" +
        (dv.message ? '<div class="dv-msg"><b>Votre précision :</b> ' + esc(dv.message) + "</div>" : "") +
        '<div class="dv-cond">Devis gratuit et sans engagement, valable 30 jours' + (exp ? " (jusqu'au " + exp + ")" : "") + ". Micro-entreprise — <b>TVA non applicable, art. 293 B du CGI</b>. Le devis final peut être ajusté après notre échange offert. Acompte éventuel précisé lors du lancement.</div>" +
        sign +
        "</div>";

      if (dv.status !== "signed") wireSign(dv);
    }

    function wireSign(dv) {
      var btn = $("#dv-signbtn"), nameEl = $("#dv-name"), okEl = $("#dv-ok"), msg = $("#dv-signmsg");
      btn.addEventListener("click", async function () {
        var name = (nameEl.value || "").trim();
        if (name.length < 2) { msg.style.color = "#c0392b"; msg.textContent = "Indiquez votre nom pour signer."; nameEl.focus(); return; }
        if (!okEl.checked) { msg.style.color = "#c0392b"; msg.textContent = "Cochez la case « bon pour accord » pour signer."; return; }
        btn.disabled = true; msg.style.color = "#55505f"; msg.textContent = "Signature en cours…";
        try {
          var r = await fetch(API + "/devis/sign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: dv.id, name: name }) });
          var j = await r.json();
          if (j && j.ok) { dv.status = "signed"; dv.signature = { name: name, date: new Date().toISOString() }; render(dv); window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }); }
          else throw 0;
        } catch (_) { btn.disabled = false; msg.style.color = "#c0392b"; msg.textContent = "Oups, réessayez dans un instant."; }
      });
    }
  });
})();
