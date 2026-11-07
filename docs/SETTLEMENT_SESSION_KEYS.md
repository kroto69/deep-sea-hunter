# Settlement session keys — invisible on-chain settlement

Status: SLICES 1–2 IMPLEMENTED LOCALLY (2026-11-07). Not deployed, not
verified on Testnet. Slice 2 added the server receipt-signing endpoint and
the catch → mint wiring; the sell/buy transfer leg and the withdrawal flow
are still missing.

## The requirement (owner, 2026-11-07)

Every sell or buy of a fish has an on-chain transaction behind the scenes,
but the player never notices it. The player only "meets" the chain when they
withdraw CR to NEAR. The transaction must show clearly which fish was sold
and by whom. The player must NOT approve/sign every transaction one by one,
because that would be slow.

## The decision: session key, approve once (model B)

The player approves exactly once, in their wallet: a **Function Call access
key** is added to their account, scoped to one contract (the merchant
contract), a short method allow-list, and a NEAR allowance for gas. After
that, the game signs settlement transactions with that key in the background
— no wallet popup per trade. The signer on-chain stays the player's own
account.

The alternative considered was a relayer (the game account signs everything).
It is fully invisible but custodial: the on-chain record would say "the game
recorded that player X sold fish Y", not "player X signed". The session key
keeps the player as signer, which is also the more player-owned design.

## Actors and keys

| Key | Held by | Can do |
|---|---|---|
| Player full-access key | Player's wallet | Everything (never touched by the game) |
| Session key (ed25519) | Game frontend, `localStorage` | Only the allow-listed methods, only on the merchant contract, only 1 yocto deposit, gas capped by the allowance |
| Server settlement key (ed25519) | Game server (NOT in this repo yet) | Signs catch receipts so the contract knows a catch is real; never signs transactions |
| Contract owner key | Game operator | `mint_asset`, `set_settlement_key`, treasury funding |

## Key lifecycle

1. **Generate** — the frontend creates a fresh ed25519 keypair
   (`KeyPair.fromRandom`) when the player enables on-chain settlement.
2. **Grant (the one approval)** — the wallet signs one transaction with a
   single `AddKey` action: receiver = the player's own account, permission =
   FunctionCall `{ receiverId: <merchant contract>, methodNames:
   ['mint_catch', 'mt_transfer', 'mt_batch_transfer'], allowance: 0.25 NEAR }`.
   The private key never leaves the browser.
3. **Use** — after a sell/buy, the frontend submits the settlement call with
   the session key through `near-api-js` directly to Testnet RPC. No wallet
   interaction. The call returns a transaction hash, stored with the trade so
   the player can check it later.
4. **Exhaustion** — when the allowance is spent, calls fail with
   `NotEnoughAllowance`. The game must ask for a fresh grant (same one-time
   flow) instead of failing silently. Allowance is charged at the buy price
   and partially refunded, so 0.25 NEAR covers roughly 100 settlement calls
   at ~0.001–0.003 NEAR gas each (estimate — measure on Testnet).
5. **Revoke** — the player deletes the key on-chain (`DeleteKey` action, one
   wallet approval) or from the game UI; the game also deletes its local
   copy. A revoked key can no longer settle, and the game falls back to
   off-chain-only trades until a new key is granted.

## Contract surface (implemented, `contracts/merchant/src/lib.rs`)

- `set_settlement_key(public_key_hex)` — owner only, 1 yocto. Stores the
  server's ed25519 public key (32 bytes, hex). Rotating it is an owner call.
- `mint_catch(receipt_id, player_id, species_id, title, signature)` — 1 yocto.
  Called by the catcher themselves (predecessor must equal `player_id`, which
  is what the session key signs as). Verifies the server's ed25519 signature
  over the message, rejects an already-settled receipt, then mints token
  `fish:{receipt_id}` (the receipt IS the asset ID, so one receipt can never
  mint two tokens) and emits the standard `mt_mint` event.
- Signed message (both sides must build exactly this string):
  `dsh-catch-v1\n{receipt_id}\n{player_id}\n{species_id}\n{title}`
  (newline-joined, domain first). Signature and public key are hex-encoded.
- Storage: metadata/supply/asset writes are charged to the contract owner,
  the balance entry to the player — same rule as `mint_asset`. The player must
  be registered and storage-funded before their first settlement (the existing
  `register()` step). A settlement to an unfunded player fails cleanly instead
  of minting an unfunded entry.
- State added: `settlement_key: Option<Vec<u8>>` and `used_receipts:
  LookupMap<String, u8>`, appended at the end of the contract struct. A
  redeploy over live state needs the Borsh schema check in
  `contracts/merchant/README.md`; a fresh deploy is preferred.

## Flows

### Grant (once)

Wallet sign-in → `ensureSessionKey()` checks local storage and the on-chain
key → if missing, generate keypair → one wallet approval (AddKey) → store the
secret locally → done. Re-granting reuses the stored key when it is still
valid on-chain.

### Catch → mint settlement (the receipt-backed path)

1. The player catches a fish; the server issues a catch receipt (already
   exists: `catch_receipts` + `inventory_receipts` tables) and signs it with
   the server settlement key. **The signing endpoint does not exist yet** —
   it is the next build step (`POST /api/near/receipt-signature`, returning
   `{receipt_id, player_id, species_id, title, signature}` for a receipt the
   caller owns).
2. The frontend calls `mint_catch` with the session key. The token lands in
   the player's on-chain balance; the receipt is marked used on-chain.
3. The sell flow then transfers that token: the player's session key calls
   `mt_transfer` to the merchant desk (or to the buyer, once P2P lands), with
   a memo carrying the receipt ID and price. The CR side still settles
   off-chain instantly, exactly as today.

### Outbox / retry

Settlement calls are queued in `localStorage` (`dsh.session.outbox`) before
sending. A failed call stays queued and is retried on the next launch while a
valid session key exists. The server keeps the trade itself (off-chain CR is
never blocked on settlement), so a missed settlement is a missing receipt,
not lost funds — but it must be visible in the trade history as "settlement
pending" rather than silently dropped.

### Withdrawal (not built)

The only moment the player "meets" the chain on purpose: one wallet approval,
CR is locked/burned off-chain, NEAR is paid from the game/merchant treasury.
Needs two decisions first: the CR→NEAR rate, and which treasury funds it.

## What the session key CANNOT do

- Move NEAR or call any other contract (receiver is pinned to the merchant
  contract).
- Attach a deposit (function-call keys can attach at most 1 yocto, which is
  exactly what `assert_one_yocto` needs — confirm on Testnet).
- Mint without a server-signed receipt, settle someone else's receipt, or
  replay a receipt (all rejected on-chain).
- Survive revocation or allowance exhaustion — both are detected, not silent.

The private key lives in the browser's `localStorage`. That is the same trust
level as the game's wallet session: anyone with script access to the page
could use it, but only within the limits above. Never copy it to the server
or into logs.

## What is built in this slice vs what remains

Built and verified locally (2026-11-07):

- Contract `set_settlement_key` + `mint_catch` with receipt replay and
  signature checks; Rust suite 52 → 59 passed, 0 failed (7 new tests,
  including a real ed25519 test vector generated with `node:crypto`).
  The mocked `ed25519_verify` was proven to verify for real: a tampered
  signature fails the test.
- `js/session-key.js`: keypair generation, one-approval grant (AddKey),
  revoke (DeleteKey), on-chain status check, background
  `callWithSessionKey`, `settleCatch`, and the localStorage outbox.
  `near-api-js@5.1.1` via esm.sh (verified 200 OK); API shapes checked
  against the installed package.
- Slice 2 — server receipt-signing endpoint (`POST
  /api/near/receipt-signature`, `GET /api/near/settlement-key`;
  `server/src/services/settlement.js`): the server signs the caller's own
  valid receipt with the seed from `SETTLEMENT_SIGNING_KEY` (generate with
  `node server/scripts/generate-settlement-key.mjs`; the seed never enters
  the repo). The signature is deterministic, so re-signing returns the same
  value; the contract still enforces once-only minting. Unit tests
  (`server/test/settlement.test.js`) pin the JS message format against the
  recorded Rust test vector — it verifies under `node:crypto` — and the
  integration test (`settlement.integration.test.js`, needs
  `TEST_DATABASE_URL`) covers the endpoint's ownership, expiry, and
  wallet-verification gates.
- Slice 2 — catch → mint wiring (`js/online.js`): after a shot lands, the
  receipt settles in the background with the session key; failures queue in
  localStorage and retry on the next launch. The chain tab shows the
  settlement status, an ENABLE INVISIBLE SETTLEMENT button (the one
  approval), and the last settled hash. The game never waits on settlement.

Honest limits of "the user never notices" (do not oversell this):

- Two one-time visible steps remain before anything is invisible: the
  session-key grant itself (one wallet approval) and a storage deposit
  (the player must be registered + storage-funded on the merchant contract
  before `mint_catch` can charge their balance entry; the chain tab already
  shows the STORAGE DEPOSIT button when below `SELLER_STORAGE`). After
  those two, catches mint with no popup.
- Guests without a verified wallet cannot settle at all: there is no NEAR
  account for `mint_catch` to pay the token to, so they keep playing
  off-chain. The endpoint answers 401 for them.
- The frontend wiring is written and syntax-checked, never run against a
  wallet or Testnet. The server endpoint is unit- and integration-tested
  locally; the full loop (grant → catch → mint → Explorer hash) is
  unverified until a real wallet does it on Testnet.

Remains (do not claim the loop is live):

1. Wiring the SELL/BUY transfer leg: after a CR sale commits, move the
   token to the merchant (or the buyer, for shop sales) with `mt_transfer`
   via the session key, and show the settlement hash / pending state in the
   trade history UI. Slice 2 only mints at catch time.
2. Testnet verification: AddKey via Meteor/MyNearWallet/HERE (support varies
   by wallet), the 1-yocto rule for function-call keys, allowance burn rate,
   and one real end-to-end settlement.
3. Withdrawal flow (rate + funding treasury decisions).
4. Redeploy of the merchant contract (new struct fields) — needs approval,
   the Borsh check, and the `storage_balance_of` `{id}` → `{account_id}`
   server change in the same release.
