#!/usr/bin/env bash
# Vérifie que toutes les URLs du sitemap répondent identiquement sur une base donnée.
# Usage :  bash check-url-parity.sh [BASE]
#   BASE par défaut = https://francoisleterrier.fr
#
# À lancer AVANT la migration (le domaine pointe encore sur GitHub Pages) puis
# APRÈS (sur Cloudflare Pages), et comparer les deux sorties : aucun code HTTP
# ne doit changer. Sert de garde-fou SEO « aucune URL indexée cassée ».
#
# Astuce : tester une base précise sans toucher au DNS —
#   bash check-url-parity.sh https://<projet>.pages.dev
set -u
BASE="${1:-https://francoisleterrier.fr}"
DIR="$(cd "$(dirname "$0")" && pwd)"
SITEMAP="$DIR/sitemap.xml"
[ -f "$SITEMAP" ] || { echo "sitemap.xml introuvable"; exit 1; }

n=0; bad=0
while read -r loc; do
  path="${loc#https://francoisleterrier.fr}"
  url="${BASE}${path}"
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -L "$url")
  n=$((n+1))
  if [ "$code" != "200" ]; then printf '  [%s] %s\n' "$code" "$url"; bad=$((bad+1)); fi
done < <(grep -oE '<loc>[^<]+</loc>' "$SITEMAP" | sed -E 's#</?loc>##g')

echo "----"
echo "Testé $n URLs sur $BASE — $bad réponse(s) non-200."
if [ "$bad" -eq 0 ]; then echo "✅ Toutes les URLs répondent 200."; else echo "⚠️  $bad URL(s) à vérifier avant de basculer le domaine."; fi
