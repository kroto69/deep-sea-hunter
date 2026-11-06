ALTER TABLE merchant_accounts ADD COLUMN enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE merchant_accounts ADD COLUMN reserve_floor BIGINT NOT NULL DEFAULT 1000 CHECK(reserve_floor>=0);
ALTER TABLE merchant_accounts ADD COLUMN max_tick BIGINT NOT NULL DEFAULT 1000 CHECK(max_tick>0);
ALTER TABLE merchant_accounts ADD COLUMN tick_spent BIGINT NOT NULL DEFAULT 0 CHECK(tick_spent>=0 AND tick_spent<=max_tick);
ALTER TABLE merchant_accounts ADD COLUMN tick_started_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp();
CREATE TABLE merchant_orders (
 id UUID PRIMARY KEY, merchant_id TEXT NOT NULL REFERENCES merchant_accounts(id), species_id TEXT NOT NULL REFERENCES species(id),
 quantity INTEGER NOT NULL CHECK(quantity>=0), unit_price BIGINT NOT NULL CHECK(unit_price>0), price_version BIGINT NOT NULL,
 expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(), UNIQUE(merchant_id,species_id));
CREATE TABLE merchant_audit (id BIGSERIAL PRIMARY KEY, merchant_id TEXT NOT NULL REFERENCES merchant_accounts(id),
 action TEXT NOT NULL, detail JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp());
CREATE TABLE market_quotes (
 id UUID PRIMARY KEY, player_id UUID NOT NULL REFERENCES players(id), merchant_id TEXT NOT NULL REFERENCES merchant_accounts(id),
 receipt_id UUID NOT NULL REFERENCES catch_receipts(id), unit_price BIGINT NOT NULL CHECK(unit_price>0), price_version BIGINT NOT NULL,
 expires_at TIMESTAMPTZ NOT NULL, settled_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp());
CREATE INDEX quotes_player_idx ON market_quotes(player_id,expires_at);
ALTER TABLE economy_transactions DROP CONSTRAINT economy_transactions_kind_check;
ALTER TABLE economy_transactions ADD CONSTRAINT economy_transactions_kind_check CHECK(kind IN ('fish_sale','equipment_upgrade','mission_reward','zone_unlock'));
ALTER TABLE economy_transactions ADD COLUMN reference_id TEXT;
ALTER TABLE economy_transactions ADD COLUMN result JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE market_transactions ADD COLUMN economy_transaction_id UUID UNIQUE REFERENCES economy_transactions(id);
CREATE FUNCTION verify_ledger_balance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tid UUID; total NUMERIC; entries INTEGER;
BEGIN
 IF TG_TABLE_NAME='economy_transactions' THEN tid:=NEW.id; ELSE tid:=COALESCE(NEW.transaction_id,OLD.transaction_id); END IF;
 SELECT COALESCE(sum(delta),0),count(*) INTO total,entries FROM ledger_entries WHERE transaction_id=tid;
 IF EXISTS(SELECT 1 FROM economy_transactions WHERE id=tid AND status='committed') AND (total<>0 OR entries<2) THEN
   RAISE EXCEPTION 'unbalanced ledger transaction %',tid USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER economy_balanced AFTER INSERT OR UPDATE ON economy_transactions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_ledger_balance();
CREATE CONSTRAINT TRIGGER ledger_balanced AFTER INSERT OR UPDATE OR DELETE ON ledger_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_ledger_balance();
CREATE TABLE mission_definitions (id TEXT PRIMARY KEY, name TEXT NOT NULL, metric TEXT NOT NULL CHECK(metric IN ('catch','photo','observe','release')), goal INTEGER NOT NULL CHECK(goal>0), reward BIGINT NOT NULL CHECK(reward>=0));
INSERT INTO mission_definitions VALUES('catch5','Catch 5 economic fish','catch',5,50),('photo2','Photograph 2 protected species','photo',2,90),('observe2','Observe turtle and manta','observe',2,30),('free1','Release a trapped turtle','release',1,50);
CREATE TABLE mission_claims(player_id UUID NOT NULL REFERENCES players(id),mission_id TEXT NOT NULL REFERENCES mission_definitions(id),transaction_id UUID NOT NULL UNIQUE REFERENCES economy_transactions(id),PRIMARY KEY(player_id,mission_id));
CREATE TABLE zone_definitions(id TEXT PRIMARY KEY,name TEXT NOT NULL,cost BIGINT NOT NULL CHECK(cost>=0),required_level INTEGER NOT NULL CHECK(required_level BETWEEN 1 AND 3));
INSERT INTO zone_definitions VALUES('reef','Coral reef',0,1),('wreck','Wreck',150,1),('kelp','Kelp forest',250,2),('trench','Deep trench',400,3);
CREATE TABLE player_zones(player_id UUID NOT NULL REFERENCES players(id),zone_id TEXT NOT NULL REFERENCES zone_definitions(id),PRIMARY KEY(player_id,zone_id));
CREATE TABLE conservation_subjects(id TEXT PRIMARY KEY,habitat_id TEXT NOT NULL REFERENCES habitats(id),species_id TEXT NOT NULL,protected BOOLEAN NOT NULL DEFAULT TRUE,can_release BOOLEAN NOT NULL DEFAULT FALSE);
CREATE TABLE conservation_events(id UUID PRIMARY KEY,player_id UUID NOT NULL REFERENCES players(id),subject_id TEXT NOT NULL REFERENCES conservation_subjects(id),activity TEXT NOT NULL CHECK(activity IN ('observe','photo','release')),idempotency_key TEXT NOT NULL,trust_tier TEXT NOT NULL DEFAULT 'client_simulated_validated' CHECK(trust_tier='client_simulated_validated'),created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),UNIQUE(player_id,idempotency_key),UNIQUE(player_id,subject_id,activity));
CREATE TABLE wallet_challenges(id UUID PRIMARY KEY,player_id UUID NOT NULL REFERENCES players(id),session_id UUID NOT NULL REFERENCES sessions(id),nonce BYTEA NOT NULL UNIQUE,message TEXT NOT NULL,recipient TEXT NOT NULL,expires_at TIMESTAMPTZ NOT NULL,used_at TIMESTAMPTZ);
CREATE TABLE chain_transactions(hash TEXT PRIMARY KEY,player_id UUID NOT NULL REFERENCES players(id),signer_id TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','failed','final')),last_error TEXT,checked_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp());
CREATE TABLE chain_events(transaction_hash TEXT NOT NULL REFERENCES chain_transactions(hash),receipt_id TEXT NOT NULL,log_index INTEGER NOT NULL,event JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(transaction_hash,receipt_id,log_index));
