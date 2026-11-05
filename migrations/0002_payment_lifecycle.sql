CREATE TABLE IF NOT EXISTS payment_lifecycle (
  order_id TEXT PRIMARY KEY REFERENCES checkout_orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',
      'quote_committed',
      'awaiting_deposit',
      'deposit_detected',
      'processing',
      'settled',
      'failed',
      'expired',
      'refunded',
      'incomplete_deposit'
    )),
  quote_id TEXT,
  deposit_address TEXT,
  deposit_memo TEXT,
  destination_tx_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS payment_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL REFERENCES checkout_orders(id) ON DELETE CASCADE,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'pelargo_api',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_payment_events_order_created
  ON payment_events(order_id, created_at, id);

CREATE TRIGGER IF NOT EXISTS payment_lifecycle_initial_event
AFTER INSERT ON payment_lifecycle
BEGIN
  INSERT INTO payment_events (order_id, previous_status, new_status, source)
  VALUES (NEW.order_id, NULL, NEW.status, 'pelargo_api');
END;

CREATE TRIGGER IF NOT EXISTS payment_lifecycle_status_event
AFTER UPDATE OF status ON payment_lifecycle
WHEN OLD.status <> NEW.status
BEGIN
  INSERT INTO payment_events (order_id, previous_status, new_status, source)
  VALUES (NEW.order_id, OLD.status, NEW.status, 'pelargo_api');
END;
