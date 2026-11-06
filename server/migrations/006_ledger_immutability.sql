-- Economic corrections must be new balanced postings, never rewritten history.
CREATE FUNCTION reject_economy_history_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'economy history is append-only' USING ERRCODE='23514';
END $$;
CREATE TRIGGER ledger_append_only BEFORE UPDATE OR DELETE ON ledger_entries FOR EACH ROW EXECUTE FUNCTION reject_economy_history_change();
CREATE TRIGGER economy_append_only BEFORE UPDATE OR DELETE ON economy_transactions FOR EACH ROW EXECUTE FUNCTION reject_economy_history_change();
CREATE INDEX pending_chain_transactions ON chain_transactions(checked_at,created_at) WHERE status='pending';
CREATE INDEX unused_wallet_challenges ON wallet_challenges(player_id,session_id,expires_at) WHERE used_at IS NULL;
