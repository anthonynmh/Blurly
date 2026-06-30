-- Background-tracked Twelve Data price refreshes.
-- The Tauri command spawns a detached task and updates this row as it goes;
-- the UI polls a row by portfolio_id to render progress and survive navigation.
CREATE TABLE price_refresh_runs (
  id TEXT PRIMARY KEY,
  portfolio_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed', 'cancelled')),
  total_count INTEGER NOT NULL DEFAULT 0,
  processed_count INTEGER NOT NULL DEFAULT 0,
  succeeded_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  current_symbol TEXT,
  error_message TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX idx_price_refresh_runs_started_at ON price_refresh_runs(started_at DESC);
CREATE INDEX idx_price_refresh_runs_portfolio_status ON price_refresh_runs(portfolio_id, status);
