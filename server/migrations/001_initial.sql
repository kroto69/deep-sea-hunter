CREATE TABLE players (
  id UUID PRIMARY KEY,
  mode TEXT NOT NULL CHECK (mode IN ('offline_guest', 'online_guest', 'wallet')),
  wallet_account TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  token_hash BYTEA NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  CHECK (expires_at > created_at)
);
CREATE INDEX sessions_player_id_idx ON sessions(player_id);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at) WHERE revoked_at IS NULL;

CREATE TABLE habitats (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  health_ppm INTEGER NOT NULL DEFAULT 1000000 CHECK (health_ppm BETWEEN 0 AND 1000000),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0)
);

CREATE TABLE species (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  habitat_id TEXT NOT NULL REFERENCES habitats(id),
  rarity TEXT NOT NULL CHECK (rarity IN ('common', 'uncommon', 'rare')),
  min_equipment_level SMALLINT NOT NULL CHECK (min_equipment_level BETWEEN 1 AND 3),
  base_price BIGINT NOT NULL CHECK (base_price > 0),
  protected BOOLEAN NOT NULL DEFAULT FALSE,
  economic_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  population_capacity INTEGER NOT NULL CHECK (population_capacity > 0)
);

CREATE TABLE populations (
  habitat_id TEXT NOT NULL REFERENCES habitats(id),
  species_id TEXT NOT NULL REFERENCES species(id),
  population_count INTEGER NOT NULL CHECK (population_count >= 0),
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  regen_per_hour_milli INTEGER NOT NULL CHECK (regen_per_hour_milli >= 0),
  remainder_milli BIGINT NOT NULL DEFAULT 0 CHECK (remainder_milli >= 0),
  last_regenerated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
  PRIMARY KEY (habitat_id, species_id),
  CHECK (population_count <= capacity)
);

CREATE TABLE player_accounts (
  player_id UUID PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  balance BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0),
  version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0)
);

CREATE TABLE player_equipment (
  player_id UUID PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  speargun_level SMALLINT NOT NULL DEFAULT 1 CHECK (speargun_level BETWEEN 1 AND 3),
  version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0)
);

CREATE TABLE player_inventory (
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  species_id TEXT NOT NULL REFERENCES species(id),
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
  PRIMARY KEY (player_id, species_id)
);

CREATE TABLE catch_sessions (
  id UUID PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  habitat_id TEXT NOT NULL REFERENCES habitats(id),
  equipment_level SMALLINT NOT NULL CHECK (equipment_level BETWEEN 1 AND 3),
  token_hash BYTEA NOT NULL UNIQUE,
  max_shots SMALLINT NOT NULL CHECK (max_shots > 0),
  shots_used SMALLINT NOT NULL DEFAULT 0 CHECK (shots_used >= 0),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  CHECK (shots_used <= max_shots),
  CHECK (expires_at > issued_at)
);
CREATE INDEX catch_sessions_player_idx ON catch_sessions(player_id, expires_at);

CREATE TABLE shot_nonces (
  session_id UUID NOT NULL REFERENCES catch_sessions(id) ON DELETE CASCADE,
  nonce TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(session_id, nonce)
);

CREATE TABLE catch_receipts (
  id UUID PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES players(id),
  species_id TEXT NOT NULL REFERENCES species(id),
  habitat_id TEXT NOT NULL REFERENCES habitats(id),
  session_id UUID NOT NULL REFERENCES catch_sessions(id),
  shot_nonce TEXT NOT NULL,
  equipment_level SMALLINT NOT NULL CHECK (equipment_level BETWEEN 1 AND 3),
  trust_tier TEXT NOT NULL CHECK (trust_tier = 'client_simulated_validated'),
  status TEXT NOT NULL CHECK (status IN ('valid', 'sold', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE(session_id, shot_nonce)
);

CREATE TABLE inventory_receipts (
  receipt_id UUID PRIMARY KEY REFERENCES catch_receipts(id),
  player_id UUID NOT NULL REFERENCES players(id),
  species_id TEXT NOT NULL REFERENCES species(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sold_at TIMESTAMPTZ
);

CREATE TABLE population_events (
  id UUID PRIMARY KEY,
  habitat_id TEXT NOT NULL,
  species_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('catch', 'regeneration', 'migration', 'environment')),
  delta INTEGER NOT NULL,
  source_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (habitat_id, species_id) REFERENCES populations(habitat_id, species_id)
);

CREATE TABLE merchant_accounts (
  id TEXT PRIMARY KEY,
  total_treasury BIGINT NOT NULL CHECK (total_treasury >= 0),
  available_balance BIGINT NOT NULL CHECK (available_balance >= 0),
  reserved_balance BIGINT NOT NULL DEFAULT 0 CHECK (reserved_balance >= 0),
  max_order BIGINT NOT NULL CHECK (max_order > 0),
  policy_version INTEGER NOT NULL DEFAULT 1 CHECK (policy_version > 0),
  CHECK (available_balance + reserved_balance <= total_treasury)
);

CREATE TABLE merchant_inventory (
  merchant_id TEXT NOT NULL REFERENCES merchant_accounts(id),
  species_id TEXT NOT NULL REFERENCES species(id),
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  PRIMARY KEY (merchant_id, species_id)
);

CREATE TABLE merchant_demand (
  merchant_id TEXT NOT NULL REFERENCES merchant_accounts(id),
  species_id TEXT NOT NULL REFERENCES species(id),
  desired_quantity INTEGER NOT NULL CHECK (desired_quantity >= 0),
  max_price BIGINT NOT NULL CHECK (max_price > 0),
  PRIMARY KEY (merchant_id, species_id)
);

CREATE TABLE market_state (
  species_id TEXT PRIMARY KEY REFERENCES species(id),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  demand INTEGER NOT NULL DEFAULT 0 CHECK (demand >= 0),
  current_price BIGINT NOT NULL CHECK (current_price > 0),
  price_version BIGINT NOT NULL DEFAULT 1 CHECK (price_version > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE game_treasury (
  id TEXT PRIMARY KEY CHECK (id = 'main'),
  balance BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0),
  version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0)
);

CREATE TABLE economy_transactions (
  id UUID PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  player_id UUID NOT NULL REFERENCES players(id),
  kind TEXT NOT NULL CHECK (kind IN ('fish_sale', 'equipment_upgrade')),
  status TEXT NOT NULL CHECK (status IN ('committed', 'rejected')),
  amount BIGINT NOT NULL CHECK (amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ledger_entries (
  id UUID PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES economy_transactions(id),
  account_type TEXT NOT NULL CHECK (account_type IN ('player', 'merchant', 'game')),
  account_id TEXT NOT NULL,
  delta BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(transaction_id, account_type, account_id)
);
CREATE INDEX ledger_account_idx ON ledger_entries(account_type, account_id, created_at);

CREATE TABLE market_transactions (
  id UUID PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  player_id UUID NOT NULL REFERENCES players(id),
  merchant_id TEXT NOT NULL REFERENCES merchant_accounts(id),
  receipt_id UUID NOT NULL UNIQUE REFERENCES inventory_receipts(receipt_id),
  species_id TEXT NOT NULL REFERENCES species(id),
  unit_price BIGINT NOT NULL CHECK (unit_price > 0),
  quote_version BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
