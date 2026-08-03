/* FL — met à jour le compteur d'avis + la note depuis la fiche Google (API Places, via le Worker).
   Met à jour les éléments [data-fl-rev-count] et [data-fl-rev-rating]. Silencieux si indisponible. */
(function () {
  "use strict";
  var API = "https://main.francois-leterrier-cmw.workers.dev";
  fetch(API + "/my-reviews").then(function (r) { return r.json(); }).then(function (d) {
    if (!d || !d.ok || d.total == null || d.rating == null || d.rating < 4) return;
    var total = Math.round(d.total);
    var rtxt = (Math.round(d.rating * 10) / 10).toFixed(1).replace(".", ",");
    [].forEach.call(document.querySelectorAll("[data-fl-rev-count]"), function (el) { el.textContent = total; });
    [].forEach.call(document.querySelectorAll("[data-fl-rev-rating]"), function (el) { el.textContent = rtxt; });
  }).catch(function () {});
})();
