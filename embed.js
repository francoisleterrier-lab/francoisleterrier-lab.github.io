/* =====================================================================
   FL — Widget « Assistant visibilité locale » à intégrer sur un site tiers.
   Le partenaire colle :
     <div data-fl-embed></div>
     <script src="https://francoisleterrier.fr/embed.js" async></script>
   Le script transforme le conteneur en carte : question -> ouvre
   francoisleterrier.fr/reponses.html?q=… (la reponse + la conversion ont
   lieu sur le site de Francois). Un lien <a href> reel vers francoisleterrier.fr
   reste present (backlink). Auto-suffisant, aucune dependance, une seule fois.
   ===================================================================== */
(function () {
  "use strict";
  if (window.__flEmbed) return; window.__flEmbed = true;
  var SITE = "https://francoisleterrier.fr";
  var targets = document.querySelectorAll("[data-fl-embed]");
  if (!targets.length) return;

  var css = ''
    + '.flw{all:initial;display:block;box-sizing:border-box;max-width:420px;margin:14px 0;padding:18px 18px 16px;'
    + 'border-radius:16px;background:linear-gradient(160deg,#0d0a1c,#120a24);border:1px solid rgba(143,230,240,.24);'
    + 'box-shadow:0 18px 40px -18px rgba(124,58,237,.6);font-family:"Segoe UI",system-ui,-apple-system,sans-serif;color:#e7e2f0}'
    + '.flw *{box-sizing:border-box;font-family:inherit}'
    + '.flw-h{display:flex;align-items:center;gap:9px;margin-bottom:4px}'
    + '.flw-dot{width:26px;height:26px;border-radius:50%;flex:none;background:linear-gradient(135deg,#28c8dd,#7c3aed,#e05bc8);display:flex;align-items:center;justify-content:center;font-size:14px}'
    + '.flw-t{font-size:15px;font-weight:700;color:#fff;line-height:1.2}'
    + '.flw-sub{margin:0 0 12px;font-size:12.5px;color:#b9b3c6;line-height:1.45}'
    + '.flw-row{display:flex;gap:8px}'
    + '.flw-row input{flex:1;min-width:0;background:rgba(255,255,255,.06);border:1px solid rgba(143,230,240,.28);'
    + 'border-radius:22px;padding:10px 14px;color:#f2ecf4;font-size:13.5px;outline:none}'
    + '.flw-row input:focus{border-color:#28c8dd;box-shadow:0 0 0 3px rgba(40,200,221,.16)}'
    + '.flw-row button{flex:none;border:0;border-radius:22px;padding:0 16px;cursor:pointer;font-size:13.5px;font-weight:800;'
    + 'color:#08111f;background:linear-gradient(90deg,#28c8dd,#7c3aed,#e05bc8)}'
    + '.flw-ex{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}'
    + '.flw-ex a{font-size:11.5px;color:#cfe9ee;text-decoration:none;border:1px solid rgba(143,230,240,.24);border-radius:16px;padding:5px 10px}'
    + '.flw-ex a:hover{border-color:#28c8dd;color:#fff}'
    + '.flw-by{display:block;margin-top:12px;font-size:11px;color:#8f8aa0;text-decoration:none}'
    + '.flw-by b{color:#8fe6f0;font-weight:700}';

  function go(q) {
    var u = SITE + "/reponses.html" + (q ? ("?q=" + encodeURIComponent(q)) : "");
    window.open(u, "_blank", "noopener");
  }

  function build(node) {
    node.innerHTML = "";
    node.className = (node.className ? node.className + " " : "") + "flw";
    var head = document.createElement("div"); head.className = "flw-h";
    var dot = document.createElement("span"); dot.className = "flw-dot"; dot.textContent = "💬"; dot.setAttribute("aria-hidden", "true");
    var t = document.createElement("span"); t.className = "flw-t"; t.textContent = "Une question sur votre visibilité ?";
    head.appendChild(dot); head.appendChild(t); node.appendChild(head);
    var sub = document.createElement("p"); sub.className = "flw-sub";
    sub.textContent = "Réseaux, fiche Google, site, référencement local : posez votre question, une IA répond à partir des guides de François Leterrier.";
    node.appendChild(sub);
    var row = document.createElement("div"); row.className = "flw-row";
    var inp = document.createElement("input"); inp.type = "text"; inp.setAttribute("aria-label", "Votre question"); inp.placeholder = "Ex : par quoi commencer pour être visible ?";
    var btn = document.createElement("button"); btn.type = "button"; btn.textContent = "Demander";
    row.appendChild(inp); row.appendChild(btn); node.appendChild(row);
    btn.addEventListener("click", function () { go(inp.value.trim()); });
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") go(inp.value.trim()); });
    var ex = document.createElement("div"); ex.className = "flw-ex";
    [["Combien coûte un community manager ?", "Prix d'un CM"], ["Comment obtenir plus d'avis Google ?", "Avis Google"], ["Site ou réseaux, par quoi commencer ?", "Site ou réseaux"]].forEach(function (p) {
      var a = document.createElement("a"); a.href = SITE + "/reponses.html?q=" + encodeURIComponent(p[0]); a.target = "_blank"; a.rel = "noopener"; a.textContent = p[1];
      ex.appendChild(a);
    });
    node.appendChild(ex);
    var by = document.createElement("a"); by.className = "flw-by"; by.href = SITE + "/reponses.html"; by.target = "_blank"; by.rel = "noopener";
    by.innerHTML = "Propulsé par <b>François Leterrier</b> — Community Manager &amp; création de site";
    node.appendChild(by);
  }

  var style = document.createElement("style"); style.textContent = css; document.head.appendChild(style);
  [].forEach.call(targets, function (n) { if (!n.getAttribute("data-fl-done")) { n.setAttribute("data-fl-done", "1"); build(n); } });
})();
