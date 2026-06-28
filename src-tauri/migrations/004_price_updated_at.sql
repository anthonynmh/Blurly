ALTER TABLE holdings ADD COLUMN price_updated_at TEXT;
UPDATE holdings SET price_updated_at = updated_at WHERE price_updated_at IS NULL;
