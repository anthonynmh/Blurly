CREATE TABLE portfolios (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  base_currency TEXT NOT NULL DEFAULT 'USD',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE holdings (
  id             TEXT PRIMARY KEY,
  portfolio_id   TEXT NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  symbol         TEXT NOT NULL,
  name           TEXT,
  asset_class    TEXT NOT NULL,
  quantity       REAL NOT NULL CHECK (quantity >= 0),
  average_price  REAL,
  current_price  REAL NOT NULL CHECK (current_price >= 0),
  currency       TEXT NOT NULL,
  sector         TEXT,
  region         TEXT,
  broker         TEXT,
  as_of_date     TEXT NOT NULL,
  notes          TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_holdings_portfolio_id ON holdings(portfolio_id);
CREATE INDEX idx_holdings_symbol       ON holdings(symbol);

CREATE TABLE portfolio_snapshots (
  id             TEXT PRIMARY KEY,
  portfolio_id   TEXT NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  snapshot_date  TEXT NOT NULL,
  total_value    REAL NOT NULL,
  snapshot_json  TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_snapshots_portfolio_id   ON portfolio_snapshots(portfolio_id);
CREATE INDEX idx_snapshots_portfolio_date ON portfolio_snapshots(portfolio_id, snapshot_date DESC);

CREATE TABLE settings (
  id                INTEGER PRIMARY KEY CHECK (id = 1),
  portfolio_name    TEXT NOT NULL DEFAULT 'My Portfolio',
  base_currency     TEXT NOT NULL DEFAULT 'USD',
  default_currency  TEXT NOT NULL DEFAULT 'USD',
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO settings (id) VALUES (1);
INSERT OR IGNORE INTO portfolios (id, name, base_currency)
  VALUES ('default', 'My Portfolio', 'USD');
