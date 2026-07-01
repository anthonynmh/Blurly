CREATE TABLE analyst_threads (
  id               TEXT PRIMARY KEY,
  analysis_run_id  TEXT,
  title            TEXT NOT NULL,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (analysis_run_id) REFERENCES analysis_runs(id) ON DELETE SET NULL
);

CREATE INDEX idx_analyst_threads_updated_at
  ON analyst_threads(updated_at DESC);

CREATE TABLE analyst_messages (
  id            TEXT PRIMARY KEY,
  thread_id     TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content       TEXT NOT NULL,
  sources_json  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (thread_id) REFERENCES analyst_threads(id) ON DELETE CASCADE
);

CREATE INDEX idx_analyst_messages_thread_created
  ON analyst_messages(thread_id, created_at ASC);
