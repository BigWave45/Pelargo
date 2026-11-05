CREATE TABLE IF NOT EXISTS merchants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  api_key_hash TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS checkout_orders (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id),
  external_order_id TEXT NOT NULL,
  amount_atomic TEXT NOT NULL,
  destination_asset TEXT NOT NULL,
  recipient TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'quote_committed', 'paid', 'failed', 'expired')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  UNIQUE (merchant_id, external_order_id)
);

CREATE TABLE IF NOT EXISTS checkout_sessions (
  jti TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES checkout_orders(id),
  merchant_id TEXT NOT NULL REFERENCES merchants(id),
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'commit_attempted', 'committed', 'expired', 'revoked')),
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_checkout_sessions_expiry
  ON checkout_sessions(status, expires_at);

CREATE INDEX IF NOT EXISTS idx_checkout_orders_merchant_created
  ON checkout_orders(merchant_id, created_at DESC);
