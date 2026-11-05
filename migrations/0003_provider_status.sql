ALTER TABLE payment_lifecycle ADD COLUMN provider_status TEXT;
ALTER TABLE payment_lifecycle ADD COLUMN provider_updated_at TEXT;
ALTER TABLE payment_lifecycle ADD COLUMN destination_tx_candidate TEXT;
ALTER TABLE payment_lifecycle ADD COLUMN last_polled_at TEXT;
