-- Durable scheduling for committed payments that still require provider or chain reconciliation.
-- Enqueueing is transactionally coupled to lifecycle eligibility via triggers.

CREATE TABLE IF NOT EXISTS payment_reconciliation_jobs (
  order_id TEXT PRIMARY KEY REFERENCES payment_lifecycle(order_id) ON DELETE CASCADE,
  next_attempt_at TEXT NOT NULL,
  lease_token TEXT,
  lease_until TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_attempt_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payment_reconciliation_due
  ON payment_reconciliation_jobs(next_attempt_at, lease_until, created_at);

INSERT OR IGNORE INTO payment_reconciliation_jobs
  (order_id, next_attempt_at, created_at, updated_at)
SELECT p.order_id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM payment_lifecycle p
 WHERE p.status IN ('deposit_detected', 'processing', 'incomplete_deposit')
   AND p.deposit_address IS NOT NULL;

CREATE TRIGGER IF NOT EXISTS payment_reconciliation_enqueue_after_insert
AFTER INSERT ON payment_lifecycle
WHEN NEW.status IN ('quote_committed', 'awaiting_deposit', 'deposit_detected', 'processing', 'incomplete_deposit')
 AND NEW.deposit_address IS NOT NULL
BEGIN
  INSERT OR IGNORE INTO payment_reconciliation_jobs
    (order_id, next_attempt_at, created_at, updated_at)
  VALUES (
    NEW.order_id,
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  );
END;

CREATE TRIGGER IF NOT EXISTS payment_reconciliation_enqueue_after_eligibility
AFTER UPDATE OF status, deposit_address ON payment_lifecycle
WHEN NEW.status IN ('quote_committed', 'awaiting_deposit', 'deposit_detected', 'processing', 'incomplete_deposit')
 AND NEW.deposit_address IS NOT NULL
 AND (
   OLD.status NOT IN ('quote_committed', 'awaiting_deposit', 'deposit_detected', 'processing', 'incomplete_deposit')
   OR OLD.deposit_address IS NULL
 )
BEGIN
  INSERT OR IGNORE INTO payment_reconciliation_jobs
    (order_id, next_attempt_at, created_at, updated_at)
  VALUES (
    NEW.order_id,
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  );
END;

CREATE TRIGGER IF NOT EXISTS payment_reconciliation_remove_terminal
AFTER UPDATE OF status ON payment_lifecycle
WHEN NEW.status IN ('settled', 'failed', 'expired', 'refunded')
BEGIN
  DELETE FROM payment_reconciliation_jobs WHERE order_id = NEW.order_id;
END;
