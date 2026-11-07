import { config } from '../config/env.js';
import { mintAsset } from './merchant-agent.js';

// Phase 3: mint one token per validated catch, after COMMIT. A retry re-uses the receipt id as the
// asset id, so the contract's "Token already minted" guard makes this idempotent.
export async function mintReceipt(db, receipt) {
  if (!config.autoMint || !config.merchantContractId || !config.merchantOwnerId) return { skipped: 'auto_mint_disabled' };
  const { rows } = await db.query('SELECT p.wallet_account,s.name,r.token_id FROM catch_receipts r JOIN players p ON p.id=r.player_id LEFT JOIN species s ON s.id=r.species_id WHERE r.id=$1', [receipt.id]);
  // Mutual exclusion with the session-key path: a receipt the browser already
  // minted (record-mint wrote its token_id) must not mint a second token here.
  if (rows[0]?.token_id) return { skipped: 'already_tokenized', tokenId: rows[0].token_id };
  const accountId = rows[0]?.wallet_account;
  if (!accountId) return { skipped: 'wallet_not_bound' };
  // Receipt ids are UUIDs; the contract rejects any asset id shorter than 8 chars or with ":".
  const assetId = `catch-${receipt.id}`;
  try {
    const hash = await mintAsset({ assetId, accountId, speciesId: receipt.speciesId, title: `${rows[0].name || receipt.speciesId} #${receipt.id.slice(0, 8)}` });
    await db.query('UPDATE catch_receipts SET token_id=$2 WHERE id=$1 AND token_id IS NULL', [`fish:${assetId}`, receipt.id]);
    return { hash, tokenId: `fish:${assetId}`, accountId };
  } catch (error) {
    if (/already minted/i.test(JSON.stringify(error.detail || error.message))) return { skipped: 'already_minted', tokenId: `fish:${assetId}` };
    return { error: error.code || 'mint_failed' };
  }
}
