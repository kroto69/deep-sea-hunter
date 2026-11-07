import 'dotenv/config';

const integer = (name, fallback, min, max) => {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer in [${min}, ${max}]`);
  return value;
};
const url = (name, fallback, protocols) => {
  const raw = process.env[name] || fallback;
  let parsed;
  try { parsed = new URL(raw); } catch { throw new Error(`${name} must be a valid URL`); }
  if (!protocols.includes(parsed.protocol)) throw new Error(`${name} protocol must be ${protocols.join(' or ')}`);
  return raw;
};

export const config = Object.freeze({
  host: process.env.API_HOST || '127.0.0.1',
  port: integer('API_PORT', 3000, 1, 65535),
  databaseUrl: url('DATABASE_URL', 'postgres://localhost/deepfish', ['postgres:', 'postgresql:']),
  allowedOrigin: process.env.ALLOWED_ORIGIN || 'http://localhost:8080',
  guestSessionTtlSeconds: integer('GUEST_SESSION_TTL_SECONDS', 2_592_000, 60, 31_536_000),
  populationTickSeconds: integer('POPULATION_TICK_SECONDS', 60, 5, 86400),
  marketTickSeconds: integer('MARKET_TICK_SECONDS', 60, 5, 86400),
  catchSessionTtlSeconds: integer('CATCH_SESSION_TTL_SECONDS', 300, 30, 3600),
  catchMaxShots: integer('CATCH_MAX_SHOTS', 30, 1, 500),
  catchMinShotIntervalMs: integer('CATCH_MIN_SHOT_INTERVAL_MS', 1000, 100, 60000),
  merchantInitialTreasury: integer('MERCHANT_INITIAL_TREASURY', 10_000, 1, 1_000_000_000),
  nearNetwork: process.env.NEAR_NETWORK || 'testnet',
  nearRpcUrl: url('NEAR_RPC_URL', 'https://test.rpc.fastnear.com', ['https:', 'http:']),
  nearContractId: process.env.NEAR_CONTRACT_ID || '',
  merchantContractId: process.env.NEAR_MERCHANT_CONTRACT_ID || '',
  merchantOwnerId: process.env.NEAR_MERCHANT_OWNER_ID || '',
  // Key lives only in the operator's NEAR credentials file; this env var selects which Testnet account signs.
  autoMint: process.env.AUTO_MINT_ENABLED === 'true'
});
if (config.nearContractId && !/^[a-z0-9_-]+(?:\.[a-z0-9_-]+)*\.testnet$/.test(config.nearContractId)) throw new Error('NEAR_CONTRACT_ID must be a Testnet account');
if (config.merchantContractId && !/^[a-z0-9_-]+(?:\.[a-z0-9_-]+)*\.testnet$/.test(config.merchantContractId)) throw new Error('NEAR_MERCHANT_CONTRACT_ID must be a Testnet account');
if (config.merchantOwnerId && !/^[a-z0-9_-]+(?:\.[a-z0-9_-]+)*\.testnet$/.test(config.merchantOwnerId)) throw new Error('NEAR_MERCHANT_OWNER_ID must be a Testnet account');
if (config.nearNetwork !== 'testnet') throw new Error('Only NEAR Testnet is permitted by this project configuration');
