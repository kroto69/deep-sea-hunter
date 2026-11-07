# Deep Sea Hunter

Low-poly underwater hunting game built with Three.js. Explore, catch fish, manage oxygen/equipment, and return to Boat Hub.

## Submission status at a glance

| Area | Status | What this means |
|---|---|---|
| Gameplay and existing Hub tabs | DONE / TESTED | Existing Three.js gameplay, controls, progression and Guest save remain. Automated coverage is headless only. |
| Fast Forward | SIMULATED / TESTED | Seven local simulated days in one minute; does not mutate save, backend or chain. |
| Online demo economy | IMPLEMENTED / TESTED | All 19 fish can be caught online; distinct per-fish base prices and merchant demand. Isolated PostgreSQL integration tests pass; CR settlement stays off-chain. |
| Merchant bankruptcy + investment | IMPLEMENTED / TESTED (unit + Fast Forward; DB integration written, needs `TEST_DATABASE_URL`) | Merchant closes when its available balance reaches its reserve floor (default 1000 CR) and reopens only when a player invests enough CR to lift it above the floor (`POST /api/market/invest`). Rule lives in `js/economy-rules.js`; closure is detected on sale and on market tick; Fast Forward simulates it. Off-chain CR only. |
| NEAR merchant | ON-CHAIN SELL VERIFIED / COMPLIANCE INCOMPLETE | Testnet `accept_purchase_order` finalized; hash and state evidence in `docs/ONCHAIN_ECONOMY_PROOF.md`. Mint disabled; NEP-245 blockers remain. |
| Merchant NEP-245 | INCOMPLETE / UNVERIFIED | Rust suite (59, was 52): +7 receipt-verified `mint_catch` tests (valid settlement, replay, bad signature, wrong catcher, missing key, owner-only rotation). Session-key settlement designed (`docs/SETTLEMENT_SESSION_KEYS.md`) + `js/session-key.js` module (grant/revoke/background calls/outbox); server receipt-signing endpoint + sell-flow wiring + Testnet verification still missing. Sandbox economy and transfer-call suites previously passed but were not re-run in this sandbox (`neard` needs fd limit 65535, container hard limit is 4096). Deployed WASM is older; redeploy checklist in `contracts/merchant/README.md`. Do not claim compliance. |
| Google/Email | NOT IMPLEMENTED | Disabled placeholders only. No identity provider or email delivery. Guest remains playable. |
| Existing collectibles NFT | DONE / TESTED (historical deployment only) | Separate deployed NFT contract; does not prove merchant trades. Not modified here. |

Verified Testnet sell finalized for one existing demo token. This proves one merchant transaction, not full NEP-245 compliance or production readiness. Local simulations and PostgreSQL balances remain off-chain.

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

Open `http://localhost:8080`. API readiness: `http://127.0.0.1:3000/ready`. Guest play does not require wallet, seed phrase, wallet popup, or gas prompt.

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
PATH=/tmp/dsh-cargo/bin:$PATH RUSTUP_HOME=/tmp/dsh-rustup CARGO_HOME=/tmp/dsh-cargo RUSTUP_TOOLCHAIN=stable cargo test --manifest-path contracts/merchant/Cargo.toml --lib -- --test-threads=1
PATH=/tmp/dsh-cargo/bin:$PATH RUSTUP_HOME=/tmp/dsh-rustup CARGO_HOME=/tmp/dsh-cargo RUSTUP_TOOLCHAIN=stable contracts/merchant/build-wasm.sh
PATH=/tmp/dsh-cargo/bin:$PATH RUSTUP_HOME=/tmp/dsh-rustup CARGO_HOME=/tmp/dsh-cargo RUSTUP_TOOLCHAIN=stable node contracts/merchant/sandbox.mjs
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
- **~5 minutes:** backend market tick updates populations, stock/demand prices and treasury-bounded merchant orders. Choose sale or hold, then plan next dive from `WHY THIS PRICE?` reasoning.
- **Per session:** complete dives and sales, earn off-chain CR, buy progression, inspect merchant inventory/treasury/history. If selling drains the merchant treasury to its reserve floor, the shop closes (CLOSED · BANKRUPT) and buys nothing until a player invests enough CR to reopen it (`POST /api/market/invest`). Fast Forward previews seven simulated days in one minute locally, including bankruptcy and an optional reopening investment; it is not a live economic tick.

## Demo economy and NEAR tab

Online Guest can catch all 19 fish shown by `js/fish.js`. Each seeded fish has its own base price and merchant demand. Catching reduces server population; selling raises merchant stock and reduces demand, so the next market tick can lower price when demand is exhausted. Merchant CR, inventory, and receipts live in PostgreSQL off-chain. Seed changes apply only after `npm run seed`; existing population rows remain unchanged.

Fast Forward is a deterministic local demo of seven days of demand, stock, and treasury. It displays before/after and does not persist or call backend/chain. A treasury at or below the 1000 CR reserve floor starts the week bankrupt (no trading); pass `invest: { day, amount }` to `simulateSevenDays` to preview a reopening investment on that day.

NEAR tab reads state from a configured `NEAR_MERCHANT_CONTRACT_ID` and exposes storage deposit, sell, and withdrawal calls. `.env.example` configures `NEAR_CONTRACT_ID` for collectibles, not merchant; set merchant ID separately to enable merchant state/actions. Mint stays disabled until receipt-backed authorization is safe. After a wallet returns a hash, UI verifies signer, receiver, merchant method, final execution status, and merchant receipt against Testnet RPC. UI shows FINAL only after successful final receipt verification; state still needs SYNC ON-CHAIN. Pending finality stays labeled pending. Verify resulting state before claiming economic settlement. Verified Testnet sale evidence in `docs/ONCHAIN_ECONOMY_PROOF.md`; merchant prototype is not confirmed NEP-245 compliant. Google/Email controls are disabled; authentication is NOT IMPLEMENTED.

## NEP-245 audit status

The separate merchant prototype is **INCOMPLETE / UNVERIFIED** against official NEP-245. One `accept_purchase_order` flow is verified finalized on Testnet; this does not establish full NEP-245 compliance. Known blockers:

- No real cross-contract receiver round-trip test; Sandbox tests cover only merchant settlement, not malicious receiver behavior.
- `EVENT_JSON` logs: mint + transfer shapes are now unit-asserted locally; a runtime log assertion on Testnet is still missing.
- Storage operations: per-write delta charging and the fund-above-minimum rule are unit-tested (minting to a minimum-funded player fails cleanly); async refunds still lack a resolver and interleaved-operation invariant proof is still missing.
- Metadata JSON ABI: missing-token `None` array shape is unit-verified; exact on-chain view serialization still needs Testnet confirmation.
- Resolver rollback/failure behavior has unit-only evidence, not runtime integration evidence.
- Batch has a hard 10-token cap and rejects duplicate IDs and empty batches (all three rejections unit-tested); these documented MVP restrictions need compatibility review. Arithmetic/storage edge cases need more tests.
- Other storage registration semantics still need a standards pass, plus a redeploy over live state needs a Borsh schema-compatibility check first (see `contracts/merchant/README.md` redeploy checklist).

No compliance claim is made. Sandbox pass validates local mint/order/sale/withdraw flow only; it does not establish deployed-code match, receiver safety or NEP-245 compliance. No deployment or paid call without explicit approval.

## Verifying on-chain activity

RPC verified finalized Testnet sell `EA4yhL4izzZtQBG1WLLUEQnVbaSgwVBf2A8wp82zeu3L`: signer `dsh-player-v1.deepfish-owner.testnet`, receiver `dsh-merchant-v1.deepfish-owner.testnet`, method `accept_purchase_order`, order `order-1`, one token. Receipt succeeded, emitted `nep245 mt_transfer`, and state shows seller balance 0, merchant balance 1, seller claim 0.01 NEAR, order filled, accounting invariant true. Explorer: https://explorer.testnet.near.org/transactions/EA4yhL4izzZtQBG1WLLUEQnVbaSgwVBf2A8wp82zeu3L. Separate storage top-up and failed attempt also occurred; details and hashes in `docs/ONCHAIN_ECONOMY_PROOF.md`. UI checks transaction finality and successful merchant receipts, then state still requires `SYNC ON-CHAIN`. Before claiming economic settlement, verify finalized hash, signer/method/arguments, receipts, and before/after contract balance, claim, and token views on Testnet. Do not retry a paid transaction while status is unknown. Deployment, funding, or reinitialization requires explicit approval.

Main documentation: [`ROADMAP.md`](ROADMAP.md), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md), [`docs/ONCHAIN_ECONOMY_PROOF.md`](docs/ONCHAIN_ECONOMY_PROOF.md).
