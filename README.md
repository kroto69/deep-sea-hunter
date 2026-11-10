# Deep Sea Hunter

Low-poly underwater hunting game built with Three.js. Explore, catch fish, manage oxygen/equipment, and return to Boat Hub.

## Submission status at a glance

| Area | Status | What this means |
|---|---|---|
| Gameplay and existing Hub tabs | DONE / TESTED | Existing Three.js gameplay, controls, progression and Guest save remain. Automated coverage is headless only. |
| Fast Forward | SIMULATED / TESTED | Seven local simulated days in one minute; does not mutate save, backend or chain. |
| Online demo economy | IMPLEMENTED / TESTED | All 19 fish can be caught online; distinct per-fish base prices, each with its own merchant demand quantity. Isolated PostgreSQL integration tests pass; CR settlement stays off-chain. |
| Merchant bankruptcy + investment | IMPLEMENTED / TESTED (unit + Fast Forward; DB integration written, needs `TEST_DATABASE_URL`) | Merchant closes when its available balance reaches its reserve floor (default 1000 CR) and reopens only when a player invests enough CR to lift it above the floor (`POST /api/market/invest`). Rule lives in `js/economy-rules.js`; closure is detected on sale and on market tick; Fast Forward simulates it. Off-chain CR only. |
| Mothership marketplace (player shops) | IMPLEMENTED LOCALLY / TESTED (unit; DB integration written, needs `TEST_DATABASE_URL`) | Hub UI built 2026-11-07 (slice 2): SHOPS tab — buy the one-time 500 CR boat-stall license (`POST /api/market/shops/license`, CR sinks to game treasury); players list caught fish at their own price and buy each other's fish in one atomic CR↔receipt swap. Listed receipts are escrowed from the merchant, and active shop listings count as market supply in the tick price (one market, one price signal). Design in `docs/MARKETPLACE_MOTHERSHIP.md`. Off-chain CR only; shop-sale on-chain settlement still needs the transfer leg (slice 3) — the receipt-signing endpoint (`POST /api/near/receipt-signature`) already exists. |
| NEAR merchant | ON-CHAIN SELL VERIFIED / COMPLIANCE INCOMPLETE | Testnet `accept_purchase_order` finalized; hash and state evidence in `docs/ONCHAIN_ECONOMY_PROOF.md`. Mint live two ways: operator auto-mint (verified on v2 Testnet) and receipt-verified session-key mint (`mint_catch`, local, needs a redeploy — deployed v2 has no `mint_catch`). NEP-245 blockers remain. |
| Merchant NEP-245 | INCOMPLETE / UNVERIFIED | Rust suite (63, was 59): +7 receipt-verified `mint_catch` tests (valid settlement, replay, bad signature, wrong catcher, missing key, owner-only key set, short key). Session-key settlement designed (`docs/SETTLEMENT_SESSION_KEYS.md`) + `js/session-key.js` module (grant/revoke/background calls/outbox); slice 2 done 2026-11-07 (server receipt-signing endpoint + catch → mint wiring, unit-tested incl. the Rust test vector) + record-mint (2026-11-07, `POST /api/near/record-mint` writes the token id so a tokenized fish cannot be sold off-chain for CR). Sell/buy transfer leg + Testnet verification still missing. Sandbox economy and transfer-call suites previously passed but were not re-run in this sandbox (`neard` needs fd limit 65535, container hard limit is 4096). Deployed v2 (SHA `6dd52d11…`) lacks `mint_catch`; merged local WASM (SHA `fdaa8915…`) needs a redeploy before session-key settlement runs on-chain; order relist is in the same build; redeploy checklist in `contracts/merchant/README.md`. Do not claim compliance. |
| Google/Email | NOT IMPLEMENTED | Disabled placeholders only. No identity provider or email delivery. Guest remains playable. |
| Existing collectibles NFT | DONE / TESTED (historical deployment only) | Separate deployed NFT contract; does not prove merchant trades. Not modified here. |

Verified Testnet sells finalized for three merchant transactions on v1 and v2, including the sale of an auto-minted catch token. This proves merchant transactions, not full NEP-245 compliance or production readiness. Local simulations and PostgreSQL balances remain off-chain.

## Where the flow stands (2026-11-07)

Flow diagram (same stages, visual): [`docs/flow-settlement-invisible.html`](docs/flow-settlement-invisible.html).

| Stage | Status | What is built |
|---|---|---|
| 0 Setup | BUILT | Wallet connect + verify; one-time session-key grant (AddKey) + storage deposit; operator auto-mint flag + owner key. Connecting a wallet auto-enters online play and prompts the one-time VERIFY WALLET signature once per browser session. |
| 1 Dive & catch | BUILT | Dive, catch, server receipt in Postgres. |
| 2 Mint | BUILT (two paths) | A: operator auto-mint — LIVE on v2 Testnet. B: session-key `mint_catch` — local only, needs a redeploy (deployed v2 has no `mint_catch`); `POST /api/near/record-mint` records the token so a tokenized fish cannot be sold off-chain for CR. One receipt mints at most once. |
| 3 Sell to merchant (CR) | BUILT (off-chain) | CR sale with `catch_minted_onchain` + `receipt_listed` guards. On-chain transfer leg (token moves with the sale) NOT built. |
| 4 Player shops | BUILT | License/list/buy/delist endpoints + escrow + supply-aware pricing + Hub UI (SHOPS tab, 2026-11-07: license, list at own price, delist, buy, market board). On-chain settlement of shop sales NOT built (transfer leg, slice 3). |
| 5 NEAR-tab token sell | BUILT (Testnet) | `accept_purchase_order` verified FINAL on v1 + v2. |
| 6 Tick + Fast Forward | BUILT | 60 s market tick; Fast Forward simulates 7 days in 1 minute, local only. |
| 7 Withdraw CR → NEAR | NOT BUILT (CR→NEAR flow) | Rate exists in code (1 CR = 0.0005 NEAR, agent conversion); the CR→NEAR conversion flow + funding source are undecided. The NEAR tab already has a WITHDRAW NEAR button that pays an existing on-chain seller claim via `withdraw_proceeds` — verified 2026-11-07 on v2 Testnet (withdraw tx `CQ8eSUfjDhjEuRnFnsnFfj3rCA4ucD4P9SfC6Sxc3mWu`, 0.009 NEAR to `flatrice4664.testnet`; sale tx `2er8mzfvHt7k5Se3QV5ub7TyqvSHFtFooTpfTPCSvDoH`). |

Background music: "Deep Ocean" by MeditationSpiritual (Pixabay, royalty-free), bundled as `audio/deep-ocean.mp3` (6:44, 128 kbps, ~6 MB — compressed from the 256 kbps / ~12 MB original), looped at 60% volume, starts on the first click; MUSIC ON/OFF button under WALLET. The static site serves it (`render.yaml` copies `audio/` to `dist/`).

## Run game and backend

Requirements: Node.js/npm, Docker Compose, Python 3. Set local-only values in `.env` using `.env.example`; never expose secrets. Preserve existing PostgreSQL volumes.

```bash
npm ci
cp .env.example .env
docker compose up -d postgres
npm run migrate
npm run seed
docker compose up -d --build api
python3 -m http.server 8080 --bind localhost
```

Open `http://localhost:8080`. API readiness: `http://127.0.0.1:3000/ready`. Guest play does not require wallet, seed phrase, wallet popup, or gas prompt. Note: the `docker compose` `api` service does not set `NEAR_MERCHANT_CONTRACT_ID`, `SETTLEMENT_SIGNING_KEY`, `AUTO_MINT_ENABLED`, or `NEAR_MERCHANT_OWNER_ID`, so under that path the NEAR tab and merchant-chain endpoints stay unconfigured (503) until you add them — see `docs/DEPLOYMENT.md` §5.

Deploying for someone else (keys, contract deploy, Render): see [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Run tests

Backend unit tests:

```bash
npm test
```

Database integration tests run when `TEST_DATABASE_URL` points to a disposable test DB/schema:

```bash
TEST_DATABASE_URL=postgres://deepfish:<local-password>@127.0.0.1:5432/deepfish npm test
```

Merchant contract local tests and WASM build (Rust toolchain plus `wasm32-unknown-unknown`):

```bash
export RUSTUP_HOME=$HOME/workspace/tools/rustup CARGO_HOME=$HOME/workspace/tools/cargo PATH=$HOME/workspace/tools/cargo/bin:$PATH
cargo test --manifest-path contracts/merchant/Cargo.toml --lib -- --test-threads=1
contracts/merchant/build-wasm.sh
node contracts/merchant/sandbox.mjs
```

Inspect source and audit notes: `contracts/merchant/src/lib.rs`, `contracts/merchant/src/tests.rs`, `contracts/merchant/README.md`. Local tests/build are not standards compliance or deployment evidence.

## Browser regression tests

Start game/API as above, then set installed Playwright and Chromium paths:

```bash
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs CHROMIUM_PATH=/absolute/path/to/chrome-headless-shell node tests/welcome-tutorial.mjs
TEST_DATABASE_URL=postgres://deepfish:<local-password>@127.0.0.1:5432/deepfish PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs CHROMIUM_PATH=/absolute/path/to/chrome-headless-shell node tests/online-smoke.mjs
node tests/fast-forward.test.mjs
```

`tests/boat-hub.mjs` is stale against current Hub tabs and currently fails waiting for `[data-tab="economy"]`; do not count it as passing coverage. `tests/wallet-login.mjs` uses mock wallet behavior; it does not prove a real login or signature. Browser sizes include desktop and 844×390 mobile landscape. Physical-device performance is UNVERIFIED.

## Track 09 game loop

- **~30 seconds:** dive target habitat, catch fish with oxygen/ammo constraints, return with server-validated receipt.
- **~5 minutes:** the player-facing loop cadence — dive, sell or hold, then plan the next dive from `WHY THIS PRICE?` reasoning. The backend market tick itself runs every 60 seconds (populations, stock/demand prices, treasury-bounded merchant orders).
- **Per session:** complete dives and sales, earn off-chain CR, buy progression, inspect merchant inventory/treasury/history. If selling drains the merchant treasury to its reserve floor, the shop closes (CLOSED · BANKRUPT) and buys nothing until a player invests enough CR to reopen it (`POST /api/market/invest`). Fast Forward previews seven simulated days in one minute locally, including bankruptcy and an optional reopening investment; it is not a live economic tick.

## Demo economy and NEAR tab

Online Guest can catch all 19 fish shown by `js/fish.js`. Each seeded fish has its own base price and merchant demand. Catching reduces server population; selling raises merchant stock and reduces demand, so the next market tick can lower price when demand is exhausted. Merchant CR, inventory, and receipts live in PostgreSQL off-chain. Seed changes apply only after `npm run seed`; existing population rows remain unchanged.

Fast Forward is a deterministic local demo of seven days of demand, stock, and treasury. It displays before/after and does not persist or call backend/chain. A treasury at or below the 1000 CR reserve floor starts the week bankrupt (no trading); pass `invest: { day, amount }` to `simulateSevenDays` to preview a reopening investment on that day.

NEAR tab reads state from a configured `NEAR_MERCHANT_CONTRACT_ID` and exposes storage deposit, sell, and withdrawal calls. `.env.example` configures `NEAR_CONTRACT_ID` for collectibles, not merchant; set merchant ID separately to enable merchant state/actions. Mint is live two ways: operator auto-mint (verified on v2 Testnet) and receipt-verified session-key mint (`mint_catch`, local — deployed v2 has no `mint_catch`, needs a redeploy). `POST /api/near/record-mint` writes the token id onto the receipt so a tokenized fish cannot be sold off-chain for CR. After a wallet returns a hash, UI verifies signer, receiver, merchant method, final execution status, and merchant receipt against Testnet RPC. UI shows FINAL only after successful final receipt verification; state still needs SYNC ON-CHAIN. Pending finality stays labeled pending. Verify resulting state before claiming economic settlement. Verified Testnet sale evidence in `docs/ONCHAIN_ECONOMY_PROOF.md`; merchant prototype is not confirmed NEP-245 compliant. Google/Email controls are disabled; authentication is NOT IMPLEMENTED.

## NEP-245 audit status

The separate merchant prototype is **INCOMPLETE / UNVERIFIED** against official NEP-245. Three `accept_purchase_order` flows are verified finalized on Testnet (v1 `EA4yhL4…`, v2 `HzMGu8uS…`, v2 `2er8mzfv…`); this does not establish full NEP-245 compliance. Known blockers:

- No real cross-contract receiver round-trip test; Sandbox tests cover only merchant settlement, not malicious receiver behavior.
- `EVENT_JSON` logs: mint + transfer shapes are now unit-asserted locally; a runtime log assertion on Testnet is still missing.
- Storage operations: per-write delta charging and the fund-above-minimum rule are unit-tested (minting to a minimum-funded player fails cleanly); async refunds have a resolver (`resolve_storage_transfer`, unit-tested) but still lack a Testnet runtime proof, and interleaved-operation invariant proof is still missing.
- Metadata JSON ABI: missing-token `None` array shape is unit-verified; exact on-chain view serialization still needs Testnet confirmation.
- Resolver rollback/failure behavior has unit-only evidence, not runtime integration evidence.
- Batch has a hard 10-token cap and rejects duplicate IDs and empty batches (all three rejections unit-tested); these documented MVP restrictions need compatibility review. Arithmetic/storage edge cases need more tests.
- Other storage registration semantics still need a standards pass, plus a redeploy over live state needs a Borsh schema-compatibility check first (see `contracts/merchant/README.md` redeploy checklist).

No compliance claim is made. Sandbox pass validates local mint/order/sale/withdraw flow only; it does not establish deployed-code match, receiver safety or NEP-245 compliance. No deployment or paid call without explicit approval.

## Verifying on-chain activity

RPC verified finalized Testnet sell `EA4yhL4izzZtQBG1WLLUEQnVbaSgwVBf2A8wp82zeu3L`: signer `dsh-player-v1.deepfish-owner.testnet`, receiver `dsh-merchant-v1.deepfish-owner.testnet`, method `accept_purchase_order`, order `order-1`, one token. Receipt succeeded, emitted `nep245 mt_transfer`, and state shows seller balance 0, merchant balance 1, seller claim 0.01 NEAR, order filled, accounting invariant true. Explorer: https://explorer.testnet.near.org/transactions/EA4yhL4izzZtQBG1WLLUEQnVbaSgwVBf2A8wp82zeu3L. Separate storage top-up and failed attempt also occurred; details and hashes in `docs/ONCHAIN_ECONOMY_PROOF.md`. UI checks transaction finality and successful merchant receipts, then state still requires `SYNC ON-CHAIN`. Before claiming economic settlement, verify finalized hash, signer/method/arguments, receipts, and before/after contract balance, claim, and token views on Testnet. Do not retry a paid transaction while status is unknown. Deployment, funding, or reinitialization requires explicit approval.

Main documentation: [`ROADMAP.md`](ROADMAP.md), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md), [`docs/ONCHAIN_ECONOMY_PROOF.md`](docs/ONCHAIN_ECONOMY_PROOF.md), [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).
