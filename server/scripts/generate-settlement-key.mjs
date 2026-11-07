// Generate the server receipt-signing key for invisible settlement.
// Run once on the operator machine: `node server/scripts/generate-settlement-key.mjs`
// Prints the seed (goes into SETTLEMENT_SIGNING_KEY in .env / Render env —
// NEVER commit it, anyone with it can authorize mint_catch for any receipt)
// and the public key (publish on the merchant contract once with
// set_settlement_key, via the owner's wallet).
import { generateKeyPairSync } from 'node:crypto';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const seedHex = privateKey.export({ format: 'der', type: 'pkcs8' }).subarray(-32).toString('hex');
const publicKeyHex = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex');
console.log('SETTLEMENT_SIGNING_KEY=' + seedHex);
console.log('Settlement public key (set_settlement_key on the merchant contract): ' + publicKeyHex);
console.log('Keep the seed secret. The public key is public by definition.');
