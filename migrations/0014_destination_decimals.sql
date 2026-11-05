ALTER TABLE merchants ADD COLUMN destination_decimals INTEGER NOT NULL DEFAULT 6 CHECK (destination_decimals BETWEEN 0 AND 30);
