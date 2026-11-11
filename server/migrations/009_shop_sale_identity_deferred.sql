-- Shop sales move a receipt (and its inventory row) from seller to buyer in
-- one transaction. The composite FK below is checked immediately, so
-- neither UPDATE can go first: updating catch_receipts breaks the
-- inventory row's reference to the old owner, and updating the
-- inventory row first references a (receipt, buyer) key that does not
-- exist yet. Make it deferrable like receipt_shot_fk in 004, so the
-- pair validates at COMMIT, when both sides agree.
ALTER TABLE inventory_receipts DROP CONSTRAINT inventory_receipt_identity_fk;
ALTER TABLE inventory_receipts ADD CONSTRAINT inventory_receipt_identity_fk
  FOREIGN KEY(receipt_id,player_id,species_id) REFERENCES catch_receipts(id,player_id,species_id)
  DEFERRABLE INITIALLY DEFERRED;
