-- Prevent stale/concurrent verifier results from inserting orphan settlement evidence.
-- Evidence may only be recorded while the lifecycle is processing and the
-- candidate transaction hash still matches the transaction being verified.
CREATE TRIGGER IF NOT EXISTS payment_settlement_evidence_insert_guard
BEFORE INSERT ON payment_settlement_evidence
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
      FROM payment_lifecycle p
     WHERE p.order_id = NEW.order_id
       AND p.status = 'processing'
       AND p.destination_tx_candidate = NEW.transaction_hash
  ) THEN RAISE(ABORT, 'settlement evidence requires matching processing candidate') END;
END;
