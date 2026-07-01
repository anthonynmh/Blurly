CREATE TABLE investment_strategy (
  id                    INTEGER PRIMARY KEY CHECK (id = 1),
  investor_personality  TEXT NOT NULL DEFAULT 'hybrid'
                         CHECK (investor_personality IN ('passive','hybrid','active')),
  notes                 TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO investment_strategy (id) VALUES (1);

CREATE TABLE strategy_milestones (
  id               TEXT PRIMARY KEY,
  label            TEXT NOT NULL,
  description      TEXT,
  target_date      TEXT NOT NULL,
  target_amount    REAL,
  target_currency  TEXT,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_strategy_milestones_sort_date
  ON strategy_milestones(sort_order ASC, target_date ASC);
