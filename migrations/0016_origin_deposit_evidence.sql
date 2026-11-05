-- Independently verified source-chain deposits submitted to the provider.
CREATE TABLE IF NOT EXISTS payment_origin_deposit_evidence (
  order_id TEXT PRIMARY KEY REFERENCES checkout_orders(id) ON DELETE CASCADE,
  origin_chain TEXT NOT NULL CHECK (origin_chain = 'BASE_SEPOLIA'),
  token_contract TEXT NOT NULL,
  transaction_hash TEXT NOT NULL UNIQUE,
  deposit_address TEXT NOT NULL,
  amount_atomic TEXT NOT NULL,
  block_number TEXT NOT NULL,
  block_hash TEXT NOT NULL,
  verification_source TEXT NOT NULL CHECK (verification_source = 'chain_rpc'),
  provider_submit_status TEXT NOT NULL,
  verified_at TEXT NOT NULL,
  submitted_at TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS payment_origin_deposit_evidence_no_update
BEFORE UPDATE ON payment_origin_deposit_evidence
BEGIN
  SELECT RAISE(ABORT, 'origin deposit evidence is immutable');
END;

CREATE TRIGGER IF NOT EXISTS payment_origin_deposit_evidence_no_delete
BEFORE DELETE ON payment_origin_deposit_evidence
BEGIN
  SELECT RAISE(ABORT, 'origin deposit evidence is immutable');
END;
