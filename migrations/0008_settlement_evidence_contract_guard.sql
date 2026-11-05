-- Tighten the settlement guard: bind NEAR asset IDs to the token contract recorded by the verifier.
DROP TRIGGER IF EXISTS payment_settlement_guard;
CREATE TRIGGER payment_settlement_guard
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
       AND e.destination_chain = upper(trim(o.destination_network))
       AND e.destination_asset = o.destination_asset
       AND e.destination_asset = 'nep141:' || e.token_contract
       AND e.recipient = o.recipient
       AND e.amount_atomic = o.amount_atomic
       AND e.transaction_hash = NEW.destination_tx_candidate
  ) THEN RAISE(ABORT, 'verified settlement evidence does not match order') END;
END;
