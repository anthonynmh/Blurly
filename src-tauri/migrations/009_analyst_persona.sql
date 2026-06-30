-- Adds a per-run persona ('light' or 'deep') driving model + web-search selection.
-- Light: gpt-4o, web search optional (honours saved setting).
-- Deep:  gpt-5.5, web search forced on.
ALTER TABLE analysis_runs ADD COLUMN persona TEXT NOT NULL DEFAULT 'light';
