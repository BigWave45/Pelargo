-- Settlement is a privileged transition backed by independently verified chain evidence.
CREATE TABLE IF NOT EXISTS payment_settlement_evidence (
  order_id TEXT PRIMARY KEY REFERENCES checkout_orders(id) ON DELETE CASCADE,
  destination_chain TEXT NOT NULL,
  destination_asset TEXT NOT NULL,
  token_contract TEXT,
  transaction_hash TEXT NOT NULL,
  recipient TEXT NOT NULL,
  amount_atomic TEXT NOT NULL,
  block_number TEXT NOT NULL,
  block_hash TEXT NOT NULL,
  confirmations INTEGER NOT NULL CHECK (confirmations >= 1),
  verification_source TEXT NOT NULL CHECK (verification_source = 'chain_rpc'),
  verified_at TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS payment_settlement_guard
BEFORE UPDATE OF status ON payment_lifecycle
WHEN NEW.status = 'settled'
BEGIN
  SELECT CASE WHEN OLD.status <> 'processing'
    THEN RAISE(ABORT, 'settlement requires processing state') END;

  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
      FROM payment_settlement_evidence e
      JOIN checkout_orders o ON o.id = e.order_id
     WHERE e.order_id = NEW.order_id
       AND e.destination_asset = o.destination_asset
       AND e.recipient = o.recipient
       AND e.amount_atomic = o.amount_atomic
       AND e.transaction_hash = NEW.destination_tx_candidate
  ) THEN RAISE(ABORT, 'verified settlement evidence does not match order') END;
END;

CREATE TRIGGER IF NOT EXISTS payment_settlement_order_sync
AFTER UPDATE OF status ON payment_lifecycle
WHEN NEW.status = 'settled'
BEGIN
  UPDATE checkout_orders SET status = 'paid'
   WHERE id = NEW.order_id AND status = 'quote_committed';
  SELECT CASE WHEN changes() <> 1
    THEN RAISE(ABORT, 'paid order state could not be synchronized') END;
END;

CREATE TRIGGER IF NOT EXISTS payment_settlement_evidence_no_update
BEFORE UPDATE ON payment_settlement_evidence
BEGIN
  SELECT RAISE(ABORT, 'settlement evidence is immutable');
END;

CREATE TRIGGER IF NOT EXISTS payment_settlement_evidence_no_delete
BEFORE DELETE ON payment_settlement_evidence
BEGIN
  SELECT RAISE(ABORT, 'settlement evidence is immutable');
END;
