CREATE TABLE IF NOT EXISTS payment_recovery_cases (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE REFERENCES checkout_orders(id),
  merchant_id TEXT NOT NULL REFERENCES merchants(id),
  session_jti TEXT NOT NULL REFERENCES checkout_sessions(jti),
  reason TEXT NOT NULL CHECK (reason IN ('upstream_commit_outcome_unknown')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  resolution_note TEXT
);

CREATE INDEX IF NOT EXISTS idx_payment_recovery_cases_status_created
  ON payment_recovery_cases(status, created_at);
