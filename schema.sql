-- fl_data — schéma initial (Cloudflare D1 / SQLite)
-- Appliquer :  wrangler d1 execute fl_data --file=schema.sql --remote
-- (local :     wrangler d1 execute fl_data --file=schema.sql --local)

PRAGMA foreign_keys = ON;

-- Leads qualifiés (assistant, formulaires, audits)
CREATE TABLE IF NOT EXISTS leads (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  nom         TEXT,
  email       TEXT,
  telephone   TEXT,
  metier      TEXT,
  besoin      TEXT,
  ville       TEXT,
  budget      TEXT,
  message     TEXT,
  source      TEXT,           -- ex: assistant, configurateur, audit
  ip_hash     TEXT            -- IP hachée (jamais l'IP en clair)
);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads (created_at);

-- Maquettes générées (Chantier 1)
CREATE TABLE IF NOT EXISTS maquettes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  metier      TEXT,
  params_json TEXT,           -- paramètres de génération
  r2_key      TEXT,           -- clé de l'asset dans R2 (fl_assets)
  status      TEXT DEFAULT 'draft'
);

-- Audits (Chantier 2)
CREATE TABLE IF NOT EXISTS audits (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  url           TEXT,
  score         INTEGER,
  resultats_json TEXT,
  ip_hash       TEXT
);
CREATE INDEX IF NOT EXISTS idx_audits_url ON audits (url);

-- Vérifications GEO/AEO (Chantier 3)
CREATE TABLE IF NOT EXISTS geo_checks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  entite        TEXT,
  ville         TEXT,
  requete       TEXT,
  resultats_json TEXT
);
