-- Keep expired lifecycle, order, and active session state synchronized.
-- This trigger is intentionally limited to uncommitted pending orders.
CREATE TRIGGER IF NOT EXISTS payment_lifecycle_expiry_sync
AFTER UPDATE OF status ON payment_lifecycle
WHEN OLD.status = 'pending' AND NEW.status = 'expired'
BEGIN
  UPDATE checkout_orders
     SET status = 'expired'
   WHERE id = NEW.order_id AND status = 'pending';
  SELECT CASE WHEN changes() <> 1
    THEN RAISE(ABORT, 'pending checkout order could not be expired') END;

  UPDATE checkout_sessions
     SET status = 'expired'
   WHERE order_id = NEW.order_id AND status = 'active';
  SELECT CASE WHEN changes() <> 1
    THEN RAISE(ABORT, 'active checkout session could not be expired') END;
END;
