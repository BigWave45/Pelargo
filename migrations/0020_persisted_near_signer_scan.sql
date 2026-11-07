-- Persist the NEAR testnet signer-recovery cursor between short reconciliation runs.
-- The existing payment_reconciliation_jobs row owns this state and is deleted
-- automatically when the payment reaches a terminal lifecycle state.
ALTER TABLE payment_reconciliation_jobs ADD COLUMN scan_candidate_hash TEXT;
ALTER TABLE payment_reconciliation_jobs ADD COLUMN scan_observed_at TEXT;
ALTER TABLE payment_reconciliation_jobs ADD COLUMN scan_first_height TEXT;
ALTER TABLE payment_reconciliation_jobs ADD COLUMN scan_last_height TEXT;
ALTER TABLE payment_reconciliation_jobs ADD COLUMN scan_next_height TEXT;
ALTER TABLE payment_reconciliation_jobs ADD COLUMN scan_chunk_hashes TEXT;
ALTER TABLE payment_reconciliation_jobs ADD COLUMN scan_chunk_offset INTEGER NOT NULL DEFAULT 0;
