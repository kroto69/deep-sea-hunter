-- Track 09 merchant bankruptcy: a broke merchant closes until a player invests.
-- bankrupt_at marks a bankruptcy closure (NULL = never broke, or reopened).
-- enabled=FALSE alone is a manual pause; only bankrupt_at means "closed broke".
-- invested_total is the lifetime CR players invested into this merchant.
ALTER TABLE merchant_accounts ADD COLUMN bankrupt_at TIMESTAMPTZ;
ALTER TABLE merchant_accounts ADD COLUMN invested_total BIGINT NOT NULL DEFAULT 0 CHECK (invested_total >= 0);
ALTER TABLE economy_transactions DROP CONSTRAINT economy_transactions_kind_check;
ALTER TABLE economy_transactions ADD CONSTRAINT economy_transactions_kind_check CHECK(kind IN ('fish_sale','equipment_upgrade','mission_reward','zone_unlock','merchant_investment'));
