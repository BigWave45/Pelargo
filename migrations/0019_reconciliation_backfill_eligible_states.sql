-- Repair reconciliation scheduling for pre-existing eligible lifecycle rows.
-- 0017's original backfill omitted quote_committed and awaiting_deposit, even though
-- the enqueue triggers treat both states as eligible. This backfill is idempotent.
INSERT OR IGNORE INTO payment_reconciliation_jobs
  (order_id, next_attempt_at, created_at, updated_at)
SELECT p.order_id,
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM payment_lifecycle p
 WHERE p.status IN ('quote_committed', 'awaiting_deposit', 'deposit_detected', 'processing', 'incomplete_deposit')
   AND p.deposit_address IS NOT NULL;
