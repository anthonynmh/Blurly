CREATE TABLE analysis_runs (
  id                  TEXT PRIMARY KEY,
  analysis_type       TEXT NOT NULL,
  provider            TEXT NOT NULL,
  model               TEXT NOT NULL,
  status              TEXT NOT NULL CHECK (status IN ('pending','running','succeeded','failed')),
  input_context_json  TEXT NOT NULL,
  output_markdown     TEXT,
  output_json         TEXT,
  sources_json        TEXT,
  error_message       TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at        TEXT
);
CREATE INDEX idx_analysis_runs_created_at ON analysis_runs(created_at DESC);

CREATE TABLE watchlist_items (
  id           TEXT PRIMARY KEY,
  symbol       TEXT NOT NULL,
  name         TEXT,
  asset_class  TEXT,
  sector       TEXT,
  region       TEXT,
  notes        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_watchlist_items_symbol ON watchlist_items(symbol);

CREATE TABLE ai_settings (
  id                     INTEGER PRIMARY KEY CHECK (id = 1),
  provider               TEXT NOT NULL DEFAULT 'openai',
  model                  TEXT NOT NULL DEFAULT 'gpt-4o',
  web_search_enabled     INTEGER NOT NULL DEFAULT 1,
  include_exact_values   INTEGER NOT NULL DEFAULT 0,
  include_quantities     INTEGER NOT NULL DEFAULT 0,
  include_notes          INTEGER NOT NULL DEFAULT 0,
  key_ref                TEXT,
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO ai_settings (id) VALUES (1);
