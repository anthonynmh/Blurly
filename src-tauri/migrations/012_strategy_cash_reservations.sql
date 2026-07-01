CREATE TABLE strategy_cash_reservations (
  id            TEXT PRIMARY KEY,
  holding_id    TEXT NOT NULL REFERENCES holdings(id)             ON DELETE CASCADE,
  milestone_id  TEXT NOT NULL REFERENCES strategy_milestones(id)  ON DELETE CASCADE,
  amount        REAL NOT NULL CHECK (amount >= 0),
  currency      TEXT NOT NULL CHECK (currency IN ('SGD','USD')),
  notes         TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_strategy_cash_reservations_milestone
  ON strategy_cash_reservations(milestone_id);
CREATE INDEX idx_strategy_cash_reservations_holding
  ON strategy_cash_reservations(holding_id);

-- Nullable icon on milestones. Values are a frontend allow-list of lucide symbol names.
ALTER TABLE strategy_milestones ADD COLUMN icon TEXT;
