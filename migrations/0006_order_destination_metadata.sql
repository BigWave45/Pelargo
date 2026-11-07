-- Persist the destination network and symbol needed for chain-specific settlement verification.
ALTER TABLE checkout_orders ADD COLUMN destination_network TEXT;
ALTER TABLE checkout_orders ADD COLUMN destination_symbol TEXT;
