#!/usr/bin/env bash
# Vérifie, après la mise en proxy Cloudflare, que les en-têtes de sécurité sont
# bien posés sur le SITE PRINCIPAL, que le SOUS-SITE /faire-part-vivant/ répond
# et n'hérite PAS de la CSP stricte (qui le casserait), et que l'API répond.
# Usage :  bash check-headers.sh [BASE]     (défaut : https://francoisleterrier.fr)
set -u
BASE="${1:-https://francoisleterrier.fr}"
EXPECT=(
  "strict-transport-security"
  "x-content-type-options"
  "x-frame-options"
  "referrer-policy"
  "permissions-policy"
  "content-security-policy"
)

hdrs() { curl -s -D - -o /dev/null --max-time 20 -L "$1"; }

echo "== Site principal : $BASE/ =="
H="$(hdrs "$BASE/")"
miss=0
for h in "${EXPECT[@]}"; do
  if printf '%s' "$H" | grep -iq "^$h:"; then
    printf '  ✅ %s\n' "$h"
  else
    printf '  ❌ MANQUANT : %s\n' "$h"; miss=$((miss+1))
  fi
done

echo ""
echo "== Sous-site : $BASE/faire-part-vivant/ =="
S="$(hdrs "$BASE/faire-part-vivant/")"
scode=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -L "$BASE/faire-part-vivant/")
printf '  code HTTP : %s %s\n' "$scode" "$([ "$scode" = 200 ] && echo ✅ || echo '❌ (doit être 200)')"
if printf '%s' "$S" | grep -iq "^content-security-policy:.*upgrade-insecure-requests"; then
  # La CSP du site principal contient 'upgrade-insecure-requests' ; si on la
  # retrouve ici, c'est que la Règle B n'exclut pas le sous-site → risque de casse.
  echo "  ⚠️  Le sous-site reçoit la CSP stricte du site principal — vérifier"
  echo "      l'exclusion /faire-part-vivant dans la Transform Rule B."
else
  echo "  ✅ Le sous-site n'hérite pas de la CSP stricte du site principal."
fi

echo ""
echo "== API Worker : $BASE/api/health =="
acode=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -L "$BASE/api/health")
printf '  code HTTP : %s %s\n' "$acode" "$([ "$acode" = 200 ] && echo ✅ || echo '⚠️')"

echo ""
echo "----"
if [ "$miss" -eq 0 ] && [ "$scode" = 200 ]; then
  echo "✅ En-têtes OK sur le site principal, sous-site accessible."
else
  echo "⚠️  $miss en-tête(s) manquant(s) sur le site principal ; sous-site code=$scode."
fi
