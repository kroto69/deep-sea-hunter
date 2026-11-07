-- One NEP-245 token per validated catch; NULL until the mint confirms on Testnet.
ALTER TABLE catch_receipts ADD COLUMN token_id TEXT;
ALTER TABLE catch_receipts ADD CONSTRAINT catch_receipt_token_unique UNIQUE(token_id);
