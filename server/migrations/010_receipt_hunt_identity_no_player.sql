-- Shop sales transfer a receipt to its buyer, but receipt_hunt_identity_fk
-- ties the receipt's player to its catch session's player, so the
-- transfer can never succeed: the session belongs to the seller's hunt
-- and is never transferred. The player tie was defense-in-depth (the
-- shot handler already validates the session belongs to the caller:
-- getHunt/submitShot both look the session up by id AND player_id);
-- the binding that must survive is session/habitat/equipment. Redefine
-- the FK without player_id, keeping that binding.
ALTER TABLE catch_sessions ADD CONSTRAINT hunt_habitat_equipment_unique UNIQUE(id, habitat_id, equipment_level);
ALTER TABLE catch_receipts DROP CONSTRAINT receipt_hunt_identity_fk;
ALTER TABLE catch_receipts ADD CONSTRAINT receipt_hunt_identity_fk
  FOREIGN KEY(session_id,habitat_id,equipment_level)
  REFERENCES catch_sessions(id,habitat_id,equipment_level);
