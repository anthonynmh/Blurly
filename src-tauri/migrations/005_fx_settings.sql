ALTER TABLE settings ADD COLUMN fx_usd_sgd_rate REAL;
ALTER TABLE settings ADD COLUMN fx_usd_sgd_as_of TEXT;
ALTER TABLE settings ADD COLUMN fx_usd_sgd_source TEXT;
ALTER TABLE settings ADD COLUMN staleness_threshold_days INTEGER;
