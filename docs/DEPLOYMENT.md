# Deploying Deep Sea Hunter (third-party operator guide)

This is the checklist for someone other than the original operator to deploy
the game from scratch. It assumes the code is on branch `main` (HEAD `f10eef3`, already on GitHub — `git ls-remote origin main` = `f10eef3`).

What you are deploying: a static Three.js frontend, a Fastify + PostgreSQL
API (the 60-second market tick runs in-process in the API), and a NEAR
merchant contract on **Testnet**. The game code is Testnet-only: the server
rejects a merchant contract ID that is not a `.testnet` account
(`server/src/config/env.js`). A Mainnet NEAR account is only needed for
hackathon prize payout, not for running the game.

## TL;DR for judges (30 seconds)

1. Clone branch `main`.
2. Run `scripts/deploy-contract.sh` with three accounts (owner / merchant
   desk / treasury) — it tests, builds, deploys with `near-cli`, and
   optionally funds the treasury with `fund_treasury` (§4).
3. Put two secrets in place: the owner key (`~/.near-credentials`, via
   `near login`) and a fresh `SETTLEMENT_SIGNING_KEY` in `.env`.
4. `npm ci`, Postgres up, `npm run migrate`, `npm run seed`, `npm start`.
5. Render Blueprint from the repo, fill `ALLOWED_ORIGIN`; if Render
   renames the service, fix the one API URL in `js/api-config.js`.
6. Verify: Guest catch → sell for CR → NEAR tab sell to FINAL → withdraw.

Everything below is the same six steps with the exact commands, the
gotchas, and the security rules. Honest limit: steps 2, 3, and 5 have not
been executed end-to-end from this guide yet — they are grounded in the
code, not in a live run — so expect small differences (e.g. `near-cli`
flag names between versions) and report them back. The deploy script in
§4 is in the same boat: it has never run live (no near-cli or Testnet
accounts in this repo's sandbox), so read it before running.

## 1. NEAR accounts to create (Testnet faucet)

The contract `new()` takes three accounts and requires all three to be
distinct (`contracts/merchant/src/lib.rs`, `new()`):

| Role | Purpose |
|---|---|
| `owner_id` | Contract owner. Only this account can mint, set the settlement key, and fund the treasury. Its private key is the operator key (see §2). |
| `merchant_id` | Merchant desk role (e.g. `dsh-merchant-desk.<owner>.testnet`). Receives sold tokens; its storage funds order accounting. |
| `treasury_id` | Treasury role. Holds the FT treasury balance the contract accounts against. |

You also need a **player/test account** (a second wallet) to verify buying,
selling, and withdrawing end-to-end. Fund every account from the Testnet
faucet before deploying: deployment + init + funding are paid transactions.

## 2. Keys and secrets to prepare

This is the "private key" question. There are exactly two secrets. Nothing
else in this project is a signing credential.

| Secret | Where it lives | How to make it | What it is for |
|---|---|---|---|
| Merchant **owner private key** | `~/.near-credentials/testnet/<owner_id>.json` — created by `near login`. **Only on the operator's machine. Never in the repo, never in `.env`, never in chat.** | `near login` with the owner account | Signs what the server does as owner: operator auto-mint (`mint_asset`) and merchant-agent purchase orders (`create_purchase_order`). The API reads it from that file when `NEAR_MERCHANT_OWNER_ID` is set (Testnet only); `AUTO_MINT_ENABLED=true` additionally gates the auto-mint caller. `set_settlement_key` and `fund_treasury` are manual owner-wallet calls, not server calls. |
| `SETTLEMENT_SIGNING_KEY` | `.env` only (server side). **Never commit a real value.** | `node server/scripts/generate-settlement-key.mjs` (prints a fresh 64-hex ed25519 seed) | The server signs catch receipts with it (`POST /api/near/receipt-signature`). Whoever holds this seed can sign receipts — treat it like a private key. The matching public key is published on-chain once via `set_settlement_key` (see §4). |

Public values (not secrets, safe to share and commit as examples):
`NEAR_CONTRACT_ID` (collectibles contract, `deepfish-contract.testnet`),
`NEAR_OWNER_ID`, `NEAR_SELLER_ID`, `NEAR_BUYER_ID`,
`NEAR_MERCHANT_CONTRACT_ID` (the deployed merchant contract account),
`DATABASE_URL` / `POSTGRES_PASSWORD` (still keep these out of the repo —
they are credentials, just not signing keys), `ALLOWED_ORIGIN`.

## 3. Build the contract

Run `npm ci` first (provides `wasm-opt` via the `binaryen` devDependency, required by `build-wasm.sh`).

```sh
export RUSTUP_HOME=$HOME/workspace/tools/rustup CARGO_HOME=$HOME/workspace/tools/cargo PATH=$HOME/workspace/tools/cargo/bin:$PATH
# or any Rust 1.99+ with target wasm32-unknown-unknown
cargo test --manifest-path contracts/merchant/Cargo.toml --lib -- --test-threads=1
contracts/merchant/build-wasm.sh
```

Record the fresh WASM SHA-256 (`sha256sum` the output) and compare it with
the deployed code hash before and after deploying. Never run
`cargo test --release` in this repo: `[profile.release]` sets
`panic = "abort"` and the test harness aborts in some sandboxes.

Fresh deploy vs redeploy over live state: the current struct gained
`settlement_key` and `used_receipts`, which change the Borsh layout.
**Prefer a fresh deploy.** Deploying the new WASM over live state from an
older build can corrupt state — check Borsh compatibility first (see the
redeploy checklist in `contracts/merchant/README.md`).

## 4. Deploy the contract (script)

Run the deploy script — it checks prerequisites, runs the contract tests,
builds the WASM (§3), asks before the paid deploy, runs `near state` afterwards and prints the explorer link so you can record the deploy hash from the log (it does not re-check for code after deploy — the no-code check runs before deploy), and prints the `.env` / Render values to set:

```sh
scripts/deploy-contract.sh --contract-id <new-contract>.testnet \
  --owner-id <owner>.testnet --merchant-id <desk>.testnet \
  --treasury-id <treasury>.testnet --fund-near 5
```

`--fund-near N` is optional (funds the treasury with N NEAR right after deploy, after a second confirmation); without it, fund later with `near call <contract> fund_treasury '{}' --accountId <owner> --deposit N` — note the script only prints that command when `--fund-near` was passed and declined, not when it was omitted. `--yes` skips the confirmation prompts — only for an
owner-attended run. Read the script before running it: it has never been
executed live (see the honest limit in the TL;DR), and `near-cli` flag
names differ between versions.

Manual fallback (the same steps the script runs, if you prefer to type
them). Install `near-cli` and log in as the contract account first (this creates `~/.near-credentials/testnet/<merchant-contract-account>.json`, which the deploy signs with; the owner key from §2 is only needed for the funding and `set_settlement_key` calls). The contract account must already exist (Testnet faucet / wallet) before running the script — it exits if `near state` cannot read it.

```sh
near deploy --accountId <merchant-contract-account> \
  --wasmFile <path-to-built-wasm> \
  --initFunction new \
  --initArgs '{"owner_id":"<owner>.testnet","merchant_id":"<desk>.testnet","treasury_id":"<treasury>.testnet","max_trade":"1000000000000000000000000","name":"Deep Sea Hunter Merchant","symbol":"DSH"}'
```

Notes:
- `max_trade` is in yoctoNEAR (the example above is 1000 NEAR). It must be
  `> 0` and `<= MAX_LIMIT` in the contract; `name` ≤ 50 chars,
  `symbol` ≤ 10 chars.
- Record the deploy transaction hash and the resulting code hash.

Then, as owner, two one-time calls:

1. **Fund the on-chain treasury** — the contract pays seller claims from
   `native_treasury` (`treasury_available()` = treasury minus reserved
   orders, seller claims, and pending withdrawals). Call `fund_treasury`
   with attached NEAR, e.g. 5 NEAR to start (a 20 CR fish pays a 0.01 NEAR seller claim — 1 CR = 0.0005 NEAR and the CR price is dynamic per species, 10–65 CR at seed, so size it to your expected volume). Owner-only.
2. **Register the settlement key** (only if you run invisible settlement) —
   start the API first with `SETTLEMENT_SIGNING_KEY` set (§5), read the
   public key from `GET /api/near/settlement-key`, then call
   `set_settlement_key` with that public key as owner. One call; rotating
   the key later is owner-only too. The public key is the ed25519 hex
   string returned by `GET /api/near/settlement-key`; the call attaches
   exactly 1 yocto (`assert_one_yocto` in the contract):

   ```sh
   near call <merchant-contract-account> set_settlement_key '{"public_key":"<hex-pubkey-from-GET-/api/near/settlement-key>"}' --accountId <owner>.testnet --depositYocto 1
   ```

## 5. Configure and run the backend

```sh
cp .env.example .env
```

Fill in `.env`. The fields that most often trip people up:

- `NEAR_MERCHANT_CONTRACT_ID` — fill in the deployed merchant contract
  account (the line is in `.env.example`, empty by default). Without it the NEAR tab shows unconfigured and the merchant-chain state and transaction endpoints return `merchant_contract_not_configured` (503); the config endpoints report `enabled: false` instead.
- `NEAR_MERCHANT_OWNER_ID` + `AUTO_MINT_ENABLED=true` — only together, and
  only if the owner key file from §2 exists on this machine. Leave
  `AUTO_MINT_ENABLED=false` (the default) if this server should not mint.
- `SETTLEMENT_SIGNING_KEY` — the seed from §2.
- `ALLOWED_ORIGIN` — the frontend URL. You only know it after §6, so fill
  it in then and restart the API.
- `DATABASE_URL` — Postgres connection string.

Then:

```sh
npm ci
docker compose up -d postgres   # or point DATABASE_URL at your Postgres
npm run migrate
npm run seed                    # once: 19 species + merchant treasury 10,000 CR; idempotent
npm start                       # or: npm run dev
curl http://127.0.0.1:3000/ready
```

## 6. Deploy the frontend (Render Blueprint — the supported path)

1. Push the branch to GitHub.
2. Render Dashboard → New → Blueprint → pick the repo.
3. When asked, fill `ALLOWED_ORIGIN` with the static site URL
   (e.g. `https://deep-sea-hunter.onrender.com`), and fill
   `NEAR_MERCHANT_CONTRACT_ID` with the deployed merchant contract account
   (it is a `sync: false` env var in `render.yaml`, so Render asks for it at
   Blueprint creation). `SETTLEMENT_SIGNING_KEY`, `AUTO_MINT_ENABLED`, and
   `NEAR_MERCHANT_OWNER_ID` are not in `render.yaml`; add them manually in
   the Render dashboard if you want invisible settlement / auto-mint.
4. After the first deploy, run `npm run seed` once in the Render Shell if
   you did not seed already.
5. **Check the real API URL.** The frontend reads the API base from exactly
   one place — `js/api-config.js` (both the game and the collectibles page
   import it). If Render renamed the API service (name already taken), fix
   that one line to the real URL, commit, and redeploy.

Free-plan trap: a free Web Service sleeps after ~15 minutes idle, which
stops the 60-second market tick and makes the first request slow. Use the
Starter plan for judging/demo. Free Postgres: 1 GB, 90 days.

Local alternative (for testing only): `npm run dev` for the API plus
`python3 -m http.server 8080` in the repo root for the game (or just
`./run.sh`, which starts everything). Trap: `js/api-config.js` points at
the not-yet-existing Render API — temporarily change it to
`http://127.0.0.1:3000` and **do not commit that change**.

## 7. Verify end-to-end (do not skip)

- `GET /ready` returns HTTP 200 `{"status":"ready","database":"ok"}`; `GET /api/near/config` shows `merchantEnabled` and the merchant contract id.
- Play online as Guest: dive Coral, catch a fish, see the receipt in the
  Market tab, sell it for CR.
- NEAR tab: connect a wallet → SYNC ON-CHAIN → a token appears (if
  auto-mint is on) → SELL → transaction reaches FINAL on the explorer →
  WITHDRAW NEAR pays the seller claim.
- SHOPS tab: buy the 500 CR license → list a fish → buy it from a second
  account.
- Check contract views: `treasury_available`, seller claims.
- Record the verification transaction hashes in
  `docs/ONCHAIN_ECONOMY_PROOF.md` (that file is the project's evidence
  log — a claim without a hash does not count).

## 8. Security rules

- Never commit `.env`, `~/.near-credentials/`, or a real
  `SETTLEMENT_SIGNING_KEY`. Rotate any secret that was ever pasted in chat
  or committed.
- The owner key signs mints and treasury movements. Keep it on one operator
  machine; do not copy it to the Render host (Render only needs the
  `SETTLEMENT_SIGNING_KEY` seed and the public contract ID).
- Redeploying over live state risks Borsh corruption — fresh deploy is the
  default. `storage_balance_of` needs no server change on redeploy: the
  server already sends `{account_id}` (`server/src/routes/near.js`),
  matching both the current contract source and deployed v2. The `{id}`
  form was only for deployed v1 (now superseded) — if you point the server
  at a contract that expects `{id}`, the NEAR tab storage read breaks.
- No deployment, initialization, funding, or paid call without the owner's
  explicit approval. Never retry a paid transaction while its status is
  unknown.
