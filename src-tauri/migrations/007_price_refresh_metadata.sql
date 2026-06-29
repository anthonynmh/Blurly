ALTER TABLE holdings ADD COLUMN price_source TEXT;
ALTER TABLE holdings ADD COLUMN price_refreshed_at TEXT;
ALTER TABLE holdings ADD COLUMN price_refresh_error TEXT;
ALTER TABLE holdings ADD COLUMN provider_symbol TEXT;

UPDATE holdings
SET price_source = 'manual'
WHERE price_source IS NULL;
