-- Bearer authentication owns hunts; remove unused second token.
ALTER TABLE catch_sessions DROP COLUMN token_hash;
ALTER TABLE player_equipment ADD COLUMN last_shot_at TIMESTAMPTZ;
ALTER TABLE catch_receipts ADD COLUMN idempotency_key TEXT;
UPDATE catch_receipts SET idempotency_key=id::text;
ALTER TABLE catch_receipts ALTER COLUMN idempotency_key SET NOT NULL;
ALTER TABLE catch_receipts ADD CONSTRAINT receipt_idempotency_key_check CHECK (idempotency_key ~ '^[A-Za-z0-9_-]{8,80}$');
ALTER TABLE catch_receipts ADD CONSTRAINT receipt_player_idempotency_unique UNIQUE(player_id,idempotency_key);
ALTER TABLE catch_receipts ADD CONSTRAINT receipt_player_shot_unique UNIQUE(player_id,shot_nonce);
ALTER TABLE catch_receipts ADD CONSTRAINT receipt_expiration_check CHECK (expires_at > created_at);
ALTER TABLE catch_sessions ADD CONSTRAINT hunt_identity_unique UNIQUE(id,player_id,habitat_id,equipment_level);
ALTER TABLE catch_receipts ADD CONSTRAINT receipt_hunt_identity_fk
  FOREIGN KEY(session_id,player_id,habitat_id,equipment_level)
  REFERENCES catch_sessions(id,player_id,habitat_id,equipment_level);
ALTER TABLE catch_receipts ADD CONSTRAINT receipt_shot_fk FOREIGN KEY(session_id,shot_nonce)
  REFERENCES shot_nonces(session_id,nonce) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE catch_receipts ADD CONSTRAINT receipt_identity_unique UNIQUE(id,player_id,species_id);
ALTER TABLE inventory_receipts ADD CONSTRAINT inventory_receipt_identity_fk
  FOREIGN KEY(receipt_id,player_id,species_id) REFERENCES catch_receipts(id,player_id,species_id);
ALTER TABLE catch_receipts ADD CONSTRAINT receipt_population_identity_unique UNIQUE(id,habitat_id,species_id);
ALTER TABLE population_events ADD COLUMN receipt_id UUID UNIQUE;
UPDATE population_events e SET receipt_id=r.id FROM catch_receipts r
  WHERE e.event_type='catch' AND e.source_key=r.id::text;
ALTER TABLE population_events ADD CONSTRAINT event_receipt_fk
  FOREIGN KEY(receipt_id,habitat_id,species_id) REFERENCES catch_receipts(id,habitat_id,species_id);
ALTER TABLE population_events ADD CONSTRAINT catch_event_check CHECK (
  (event_type='catch' AND receipt_id IS NOT NULL AND delta=-1 AND source_key=receipt_id::text)
  OR (event_type<>'catch' AND receipt_id IS NULL));
CREATE INDEX inventory_receipts_owner_idx ON inventory_receipts(player_id,species_id);
CREATE INDEX population_events_habitat_time_idx ON population_events(habitat_id,species_id,created_at);
ALTER TABLE sessions ALTER COLUMN created_at SET DEFAULT clock_timestamp();
ALTER TABLE catch_sessions ALTER COLUMN issued_at SET DEFAULT clock_timestamp();
ALTER TABLE catch_receipts ALTER COLUMN created_at SET DEFAULT clock_timestamp();
