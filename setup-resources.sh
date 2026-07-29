#!/usr/bin/env bash
# =============================================================================
# setup-resources.sh — crée les ressources Cloudflare et remplit wrangler.toml
# TOUT SEUL. Le seul geste manuel : `npx wrangler login` (dans TON navigateur,
# tes identifiants ne sortent pas de ta machine).
#
# Usage, depuis le dossier du dépôt :
#     npm install          # une fois (installe wrangler)
#     npx wrangler login   # une fois (ouvre ton navigateur)
#     bash setup-resources.sh
#
# Le script : crée KV + D1 + R2, injecte les IDs dans wrangler.toml,
# applique le schéma D1. Il ne touche à AUCUN secret.
# =============================================================================
set -uo pipefail
cd "$(dirname "$0")"
WR="npx --yes wrangler"
TOML="wrangler.toml"

say() { printf '\n\033[1;36m▸ %s\033[0m\n' "$1"; }
ok()  { printf '\033[1;32m✅ %s\033[0m\n' "$1"; }
warn(){ printf '\033[1;33m⚠️  %s\033[0m\n' "$1"; }

# 0) connecté ?
if ! $WR whoami >/dev/null 2>&1; then
  warn "Tu n'es pas connecté. Lance d'abord :  npx wrangler login"
  exit 1
fi
ok "Compte Cloudflare connecté."

# 1) KV namespace ---------------------------------------------------------------
say "Création du KV namespace « fl_cache »…"
KV_OUT="$($WR kv namespace create fl_cache 2>&1)"; echo "$KV_OUT"
KV_ID="$(printf '%s' "$KV_OUT" | grep -oiE 'id[[:space:]]*=[[:space:]]*"?[0-9a-f]{32}' | grep -oE '[0-9a-f]{32}' | head -1)"

# 2) D1 database ----------------------------------------------------------------
say "Création de la base D1 « fl_data »…"
D1_OUT="$($WR d1 create fl_data 2>&1)"; echo "$D1_OUT"
D1_ID="$(printf '%s' "$D1_OUT" | grep -oiE 'database_id[[:space:]]*=[[:space:]]*"?[0-9a-f-]{36}' | grep -oE '[0-9a-f-]{36}' | head -1)"

# 3) R2 bucket ------------------------------------------------------------------
say "Création du bucket R2 « fl_assets »…"
$WR r2 bucket create fl_assets 2>&1 || warn "Bucket déjà existant ? (sans gravité)"

# 4) Injection dans wrangler.toml ----------------------------------------------
say "Écriture des IDs dans $TOML…"
if [ -n "${KV_ID:-}" ]; then
  sed -i.bak "s/<KV_ID>/$KV_ID/" "$TOML"; ok "KV_ID = $KV_ID"
else
  warn "KV_ID non détecté automatiquement. Récupère-le via  npx wrangler kv namespace list  puis remplace <KV_ID> dans $TOML."
fi
if [ -n "${D1_ID:-}" ]; then
  sed -i.bak "s/<D1_ID>/$D1_ID/" "$TOML"; ok "D1_ID = $D1_ID"
else
  warn "D1_ID non détecté automatiquement. Récupère-le via  npx wrangler d1 list  puis remplace <D1_ID> dans $TOML."
fi
rm -f "$TOML.bak"

# 5) Schéma D1 ------------------------------------------------------------------
if [ -n "${D1_ID:-}" ]; then
  say "Application du schéma (leads, maquettes, audits, geo_checks)…"
  $WR d1 execute fl_data --file=schema.sql --remote || warn "Schéma non appliqué — relance : npx wrangler d1 execute fl_data --file=schema.sql --remote"
fi

# 6) Suite ----------------------------------------------------------------------
say "Ressources prêtes. Il ne reste QUE (secrets → jamais dans le dépôt) :"
cat <<'EOF'
  npx wrangler secret put LLM_API_KEY
  npx wrangler secret put PAGESPEED_API_KEY
  npx wrangler deploy
  curl https://francoisleterrier.fr/api/health      # doit renvoyer {"ok":true}

Puis commite le wrangler.toml complété :
  git add wrangler.toml && git commit -m "Cloudflare : IDs KV/D1 renseignés" && git push
EOF
