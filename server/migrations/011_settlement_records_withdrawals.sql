-- Slice 3, part 1 (2026-11-11): record on-chain settlements in trade history.
--
-- chain_transactions gains the link a trade history needs: which receipt a
-- hash settles, which contract method it was, and which contract received
-- it. contract_id also fixes a latent reconcile bug: reconcile() checks the
-- receiver against the collectibles contract (NEAR_CONTRACT_ID), so a
-- merchant-contract hash recorded here would be wrongly marked failed.
-- reconcile() now dispatches on contract_id instead (see near.js).
ALTER TABLE chain_transactions ADD COLUMN receipt_id UUID REFERENCES catch_receipts(id);
ALTER TABLE chain_transactions ADD COLUMN method TEXT;
ALTER TABLE chain_transactions ADD COLUMN contract_id TEXT;

-- Slice 3, part 2 (2026-11-11): CR -> NEAR withdrawals. Two new ledger
-- kinds; the CR side is a balanced player -> game-treasury sink, the NEAR
-- side is paid from the operator's owner account (see withdraw.js).
ALTER TABLE economy_transactions DROP CONSTRAINT economy_transactions_kind_check;
ALTER TABLE economy_transactions ADD CONSTRAINT economy_transactions_kind_check CHECK(kind IN ('fish_sale','equipment_upgrade','mission_reward','zone_unlock','merchant_investment','shop_license','shop_sale','cr_withdrawal','cr_withdrawal_refund'));

-- One row per withdrawal request. The CR debit and this row commit together;
-- the NEAR send happens after, so the row tracks the send outcome. A row in
-- 'pending' whose send was never attempted can be resumed with the same
-- idempotency key; a row whose send was attempted but whose outcome was
-- lost is never re-sent (double-pay risk) and goes to 'needs_review'.
-- amount_yocto is TEXT: yocto values do not fit in BIGINT.
CREATE TABLE cr_withdrawals (
  id UUID PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES players(id),
  wallet_account TEXT NOT NULL,
  amount_cr BIGINT NOT NULL CHECK (amount_cr > 0),
  amount_yocto TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','needs_review')),
  tx_hash TEXT,
  error TEXT,
  refunded BOOLEAN NOT NULL DEFAULT FALSE,
  idempotency_key TEXT NOT NULL UNIQUE,
  send_attempted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX cr_withdrawals_player_idx ON cr_withdrawals(player_id, created_at DESC);
