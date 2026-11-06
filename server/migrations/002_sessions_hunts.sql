ALTER TABLE populations RENAME COLUMN remainder_milli TO remainder_nano;

ALTER TABLE catch_sessions ADD COLUMN last_shot_at TIMESTAMPTZ;
ALTER TABLE catch_sessions ALTER COLUMN expires_at SET DEFAULT (clock_timestamp() + interval '5 minutes');
ALTER TABLE catch_sessions ADD COLUMN min_shot_interval_ms INTEGER NOT NULL DEFAULT 250 CHECK (min_shot_interval_ms BETWEEN 100 AND 60000);

ALTER TABLE catch_receipts ADD COLUMN nonce UUID NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX catch_receipts_nonce_unique ON catch_receipts(nonce);
CREATE INDEX catch_receipts_player_created_idx ON catch_receipts(player_id, created_at DESC);
CREATE INDEX catch_receipts_expiry_idx ON catch_receipts(expires_at) WHERE status = 'valid';

ALTER TABLE inventory_receipts
  ADD CONSTRAINT inventory_receipts_player_species_fk FOREIGN KEY (player_id, species_id)
  REFERENCES player_inventory(player_id, species_id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE catch_receipts
  ADD CONSTRAINT catch_receipt_habitat_species_fk FOREIGN KEY (habitat_id, species_id)
  REFERENCES populations(habitat_id, species_id);

ALTER TABLE catch_receipts ADD CONSTRAINT catch_receipt_nonce_check CHECK (nonce <> '00000000-0000-0000-0000-000000000000');
