-- Keep order/session state in lockstep with the authoritative lifecycle transition.
-- Any missing or stale dependent row aborts the lifecycle update atomically.
CREATE TRIGGER IF NOT EXISTS payment_lifecycle_commit_sync
AFTER UPDATE OF status ON payment_lifecycle
WHEN OLD.status = 'pending' AND NEW.status = 'quote_committed'
BEGIN
  UPDATE checkout_orders
     SET status = 'quote_committed'
   WHERE id = NEW.order_id AND status = 'pending';
  SELECT CASE WHEN changes() <> 1
    THEN RAISE(ABORT, 'checkout order state could not be synchronized') END;

  UPDATE checkout_sessions
     SET status = 'committed'
   WHERE order_id = NEW.order_id AND status = 'commit_attempted';
  SELECT CASE WHEN changes() <> 1
    THEN RAISE(ABORT, 'checkout session state could not be synchronized') END;
END;
