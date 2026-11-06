CREATE TABLE IF NOT EXISTS password_reset_tokens (
 token_hash TEXT PRIMARY KEY,
 merchant_id TEXT NOT NULL REFERENCES merchant_accounts(merchant_id) ON DELETE CASCADE,
 created_at TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 used_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expiry ON password_reset_tokens(expires_at);
