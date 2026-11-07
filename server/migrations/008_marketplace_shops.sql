-- Mothership marketplace, slice 1 (docs/MARKETPLACE_MOTHERSHIP.md).
-- Player shops inside the lobby hub: a CR license, receipts listed at the
-- seller's own price, and player-to-player sales. A listed receipt is
-- escrowed: it cannot be sold to the merchant while listed (enforced in the
-- quote/sell service, not here), and one receipt can have at most one active
-- listing (partial unique index below). Shop sales are balanced ledger
-- transactions player -> player, so they need their own kinds.
ALTER TABLE economy_transactions DROP CONSTRAINT economy_transactions_kind_check;
ALTER TABLE economy_transactions ADD CONSTRAINT economy_transactions_kind_check CHECK(kind IN ('fish_sale','equipment_upgrade','mission_reward','zone_unlock','merchant_investment','shop_license','shop_sale'));

-- One shop license per player. The CR is sunk into the game treasury.
CREATE TABLE shop_licenses (
  player_id UUID PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  tier TEXT NOT NULL DEFAULT 'boat' CHECK (tier = 'boat'),
  price_paid BIGINT NOT NULL CHECK (price_paid > 0),
  transaction_id UUID NOT NULL UNIQUE REFERENCES economy_transactions(id),
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  active BOOLEAN NOT NULL DEFAULT TRUE
);

-- A listing is one caught fish (one receipt) at the seller's own price.
-- status 'active' = offered on the market and counted as market supply;
-- 'sold' = bought by another player; 'delisted' = taken off the market.
CREATE TABLE shop_listings (
  id UUID PRIMARY KEY,
  seller_id UUID NOT NULL REFERENCES players(id),
  receipt_id UUID NOT NULL REFERENCES catch_receipts(id),
  species_id TEXT NOT NULL REFERENCES species(id),
  price BIGINT NOT NULL CHECK (price > 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','sold','delisted')),
  buyer_id UUID REFERENCES players(id),
  transaction_id UUID REFERENCES economy_transactions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  sold_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX shop_listings_active_receipt_unique ON shop_listings(receipt_id) WHERE status = 'active';
CREATE INDEX shop_listings_active_species_idx ON shop_listings(species_id) WHERE status = 'active';
CREATE INDEX shop_listings_seller_idx ON shop_listings(seller_id, status);
