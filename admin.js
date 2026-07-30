/* =====================================================================
   FL — Tableau de bord privé des leads (Chantier 4).
   Auth par clé (secret Worker ADMIN_TOKEN), lecture /admin/leads,
   gestion du statut, recherche/filtre, export CSV. Aucune donnée en clair
   dans la page : tout vient du Worker après authentification.
   ===================================================================== */
(function () {
  "use strict";
  var API = "https://main.francois-leterrier-cmw.workers.dev";
  var KEY = "fl_admin_token";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  var STATUS = { nouveau: "Nouveau", contacte: "Contacté", converti: "Converti", perdu: "Perdu" };
  var SRC = { audit: "Audit", generateur: "Générateur", devis: "Devis" };

  var token = "", allLeads = [];

  function ready(fn) { document.readyState !== "loading" ? fn() : document.addEventListener("DOMContentLoaded", fn); }
  ready(function () {
    var loginSec = $("#ad-login"), dash = $("#ad-dash"), actions = $("#ad-actions"),
      loginForm = $("#ad-login-form"), tokenInput = $("#ad-token"), loginMsg = $("#ad-login-msg"),
      rowsEl = $("#ad-rows"), statsEl = $("#ad-stats"), emptyEl = $("#ad-empty"),
      searchEl = $("#ad-search"), srcEl = $("#ad-source"), stFilterEl = $("#ad-status-filter");

    function authHeaders(extra) { var h = { Authorization: "Bearer " + token }; if (extra) for (var k in extra) h[k] = extra[k]; return h; }
    function showLogin(msg) { dash.hidden = true; actions.hidden = true; loginSec.hidden = false; if (msg) { loginMsg.style.color = "#ffb4b4"; loginMsg.textContent = msg; } }
    function showDash() { loginSec.hidden = true; dash.hidden = false; actions.hidden = false; }

    async function load() {
      try {
        var r = await fetch(API + "/admin/leads", { headers: authHeaders() });
        if (r.status === 401) { localStorage.removeItem(KEY); token = ""; showLogin("Clé invalide. Réessayez."); return; }
        if (r.status === 503) { showLogin("Le back-office n'est pas encore configuré côté serveur (clé ADMIN_TOKEN à définir)."); return; }
        var j = await r.json();
        if (!j || !j.ok) { showLogin("Erreur de chargement. Réessayez."); return; }
        allLeads = j.leads || [];
        localStorage.setItem(KEY, token);
        showDash();
        render();
      } catch (_) { showLogin("Connexion impossible. Vérifiez votre réseau."); }
    }

    function within7d(iso) { var t = Date.parse(iso); if (isNaN(t)) return false; return (Date.now() - t) < 7 * 864e5; }
    function fmtDate(iso) { var t = Date.parse(iso); if (isNaN(t)) return esc(iso || ""); var d = new Date(t); function p(n) { return (n < 10 ? "0" : "") + n; } return p(d.getDate()) + "/" + p(d.getMonth() + 1) + "/" + d.getFullYear() + " " + p(d.getHours()) + ":" + p(d.getMinutes()); }

    function filtered() {
      var q = (searchEl.value || "").trim().toLowerCase(), src = srcEl.value, stf = stFilterEl.value;
      return allLeads.filter(function (l) {
        if (src && l.source !== src) return false;
        if (stf && (l.status || "nouveau") !== stf) return false;
        if (q) {
          var hay = [l.email, l.ville, l.metier, l.nom, l.url, l.source].join(" ").toLowerCase();
          if (hay.indexOf(q) < 0) return false;
        }
        return true;
      });
    }

    function stat(n, label, big) { return '<div class="stat' + (big ? " big" : "") + '"><div class="n">' + n + '</div><div class="l">' + label + "</div></div>"; }
    function renderStats(list) {
      var c = { nouveau: 0, contacte: 0, converti: 0, perdu: 0 }, week = 0;
      allLeads.forEach(function (l) { c[l.status || "nouveau"] = (c[l.status || "nouveau"] || 0) + 1; if (within7d(l.date)) week++; });
      statsEl.innerHTML =
        stat(allLeads.length, "Total", true) + stat(week, "Cette semaine") +
        stat(c.nouveau || 0, "Nouveaux") + stat(c.contacte || 0, "Contactés") +
        stat(c.converti || 0, "Convertis") + stat(c.perdu || 0, "Perdus");
    }

    function detailCell(l) {
      if (l.source === "devis") {
        var w = [l.metier, l.nom].filter(Boolean).map(esc).join(" · ");
        var lk = l.shareId ? '<div class="sub"><a href="devis.html?id=' + esc(l.shareId) + '" target="_blank" rel="noopener">Voir le devis →</a></div>' : "";
        return (w || '<span class="muted">devis</span>') + lk;
      }
      if (l.source === "generateur") {
        var who = [l.metier, l.nom].filter(Boolean).map(esc).join(" · ");
        var link = l.shareId ? '<div class="sub"><a href="generateur.html?site=' + esc(l.shareId) + '" target="_blank" rel="noopener">Voir la maquette →</a></div>' : "";
        return (who || '<span class="muted">—</span>') + link;
      }
      if (l.source === "audit") {
        var u = l.url ? '<a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.url.replace(/^https?:\/\//, "")) + "</a>" : '<span class="muted">site non précisé</span>';
        var sc = l.score != null ? '<div class="sub">Score <span class="score" style="color:' + (l.score >= 80 ? "#37d67a" : l.score >= 50 ? "#f0a04b" : "#ff6b6b") + '">' + l.score + "/100</span></div>" : "";
        return u + sc;
      }
      return l.url ? '<a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.url) + "</a>" : '<span class="muted">—</span>';
    }

    function statusSelect(l) {
      var opts = Object.keys(STATUS).map(function (k) { return '<option value="' + k + '"' + ((l.status || "nouveau") === k ? " selected" : "") + ">" + STATUS[k] + "</option>"; }).join("");
      return '<select class="st-sel gbtn st-' + esc(l.status || "nouveau") + '" data-id="' + esc(l.id) + '">' + opts + "</select>";
    }

    function render() {
      renderStats();
      var list = filtered();
      emptyEl.hidden = list.length > 0;
      rowsEl.innerHTML = list.map(function (l) {
        var badge = '<span class="badge b-' + (SRC[l.source] ? l.source : "other") + '">' + esc(SRC[l.source] || l.source || "—") + "</span>";
        return "<tr>" +
          '<td class="dt">' + fmtDate(l.date) + "</td>" +
          "<td>" + badge + "</td>" +
          '<td><div class="em">' + esc(l.email || "—") + "</div>" + (l.ville ? '<div class="sub">' + esc(l.ville) + "</div>" : "") + "</td>" +
          "<td>" + detailCell(l) + "</td>" +
          "<td>" + statusSelect(l) + "</td>" +
          "</tr>";
      }).join("");
      // brancher les selects de statut
      Array.prototype.forEach.call(rowsEl.querySelectorAll(".st-sel"), function (sel) {
        sel.addEventListener("change", function () { changeStatus(sel.getAttribute("data-id"), sel.value, sel); });
      });
    }

    async function changeStatus(id, status, sel) {
      var prev = sel.getAttribute("data-prev") || "";
      sel.disabled = true;
      try {
        var r = await fetch(API + "/admin/lead-status", { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ id: parseInt(id, 10), status: status }) });
        var j = await r.json();
        if (!j || !j.ok) throw 0;
        var lead = allLeads.filter(function (l) { return String(l.id) === String(id); })[0];
        if (lead) lead.status = status;
        sel.className = "st-sel gbtn st-" + status;
        renderStats();
      } catch (_) { alert("Mise à jour impossible, réessayez."); }
      finally { sel.disabled = false; }
    }

    function exportCSV() {
      var list = filtered();
      var head = ["Date", "Source", "Email", "Statut", "Ville", "Metier", "Nom", "URL", "Score", "LienMaquette"];
      function cell(v) { v = String(v == null ? "" : v); return /[",;\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
      var lines = [head.join(";")];
      list.forEach(function (l) {
        lines.push([fmtDate(l.date), SRC[l.source] || l.source, l.email, STATUS[l.status] || l.status || "", l.ville, l.metier, l.nom, l.url, l.score == null ? "" : l.score, l.shareId ? "https://francoisleterrier.fr/generateur.html?site=" + l.shareId : ""].map(cell).join(";"));
      });
      var blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
      var a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = "leads-fl-" + new Date().toISOString().slice(0, 10) + ".csv";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    }

    loginForm.addEventListener("submit", function (e) { e.preventDefault(); token = (tokenInput.value || "").trim(); if (!token) return; loginMsg.style.color = "var(--muted)"; loginMsg.textContent = "Connexion…"; load(); });
    $("#ad-refresh").addEventListener("click", load);
    $("#ad-export").addEventListener("click", exportCSV);
    $("#ad-logout").addEventListener("click", function () { localStorage.removeItem(KEY); token = ""; allLeads = []; tokenInput.value = ""; showLogin(""); });
    [searchEl, srcEl, stFilterEl].forEach(function (el) { el.addEventListener("input", render); });

    // reprise de session
    token = localStorage.getItem(KEY) || "";
    if (token) load(); else showLogin("");
  });
})();
