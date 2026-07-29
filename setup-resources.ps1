# =============================================================================
# setup-resources.ps1 — Windows / PowerShell
# Cree les ressources Cloudflare et remplit wrangler.toml automatiquement.
# Seul geste manuel : `npx wrangler login` (dans TON navigateur ; tes identifiants
# ne sortent pas de ta machine). Le script ne touche a AUCUN secret.
#
# Depuis le dossier du depot, dans PowerShell :
#     npm install
#     npx wrangler login
#     powershell -ExecutionPolicy Bypass -File .\setup-resources.ps1
# =============================================================================

$root = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
$toml = Join-Path $root "wrangler.toml"

function Say ($m) { Write-Host "`n> $m" -ForegroundColor Cyan }
function Ok  ($m) { Write-Host "[OK] $m" -ForegroundColor Green }
function Warn($m) { Write-Host "[!] $m"  -ForegroundColor Yellow }

# 0) connecte ?
& npx --yes wrangler whoami *> $null
if ($LASTEXITCODE -ne 0) { Warn "Connecte-toi d'abord :  npx wrangler login"; exit 1 }
Ok "Compte Cloudflare connecte."

# 1) KV namespace
Say "Creation du KV namespace fl_cache..."
$kv = (& npx --yes wrangler kv namespace create fl_cache 2>&1 | Out-String)
Write-Host $kv
$kvId = ([regex]::Match($kv, 'id\s*=\s*"?([0-9a-f]{32})')).Groups[1].Value

# 2) D1 database
Say "Creation de la base D1 fl_data..."
$d1 = (& npx --yes wrangler d1 create fl_data 2>&1 | Out-String)
Write-Host $d1
$d1Id = ([regex]::Match($d1, 'database_id\s*=\s*"?([0-9a-f-]{36})')).Groups[1].Value

# 3) R2 bucket
Say "Creation du bucket R2 fl_assets..."
& npx --yes wrangler r2 bucket create fl_assets 2>&1 | Write-Host

# 4) Injection des IDs dans wrangler.toml (UTF-8 sans BOM, preserve les accents)
Say "Ecriture des IDs dans wrangler.toml..."
$enc = New-Object System.Text.UTF8Encoding($false)
$content = [System.IO.File]::ReadAllText($toml)
if ($kvId) { $content = $content.Replace('<KV_ID>', $kvId); Ok "KV_ID = $kvId" }
else { Warn "KV_ID non detecte. Recupere-le : npx wrangler kv namespace list, puis remplace <KV_ID>." }
if ($d1Id) { $content = $content.Replace('<D1_ID>', $d1Id); Ok "D1_ID = $d1Id" }
else { Warn "D1_ID non detecte. Recupere-le : npx wrangler d1 list, puis remplace <D1_ID>." }
[System.IO.File]::WriteAllText($toml, $content, $enc)

# 5) Schema D1
if ($d1Id) {
  Say "Application du schema (leads, maquettes, audits, geo_checks)..."
  & npx --yes wrangler d1 execute fl_data --file=schema.sql --remote
}

# 6) Suite (secrets -> jamais dans le depot)
Say "Ressources pretes. Il reste :"
Write-Host @"
  npx wrangler secret put LLM_API_KEY
  npx wrangler secret put PAGESPEED_API_KEY
  npx wrangler deploy
  curl.exe https://francoisleterrier.fr/api/health      # -> {"ok":true}
"@
