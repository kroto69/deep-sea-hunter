# Merchant contract prototype

Separate merchant contract prototype. Existing collectibles contract is untouched. Testnet `accept_purchase_order` sale and storage top-up were submitted from `dsh-player-v1.deepfish-owner.testnet` and verified final by RPC; hashes and state evidence recorded below and in `docs/ONCHAIN_ECONOMY_PROOF.md`. This is not evidence of NEP-245 compliance or deployment readiness.

## Status: NEP-245 partial, not verified compliant

Read-only RPC audit recorded deployed code hash `61u8Z12Pi1AcbekbvAEst7jp4Am2JJLG7JG2baMmZLRJ`; finalized merchant sale later used this code hash and transferred one `fish:fish-demo-0001` into `dsh-merchant-desk.deepfish-owner.testnet`, creating 0.01 NEAR seller claim. Storage top-up `G2X3oGevwSDaXdMgo43yV4jZXqz2NfTxNgLfr3LNFJgw` also finalized. App uses contract account `dsh-merchant-v1.deepfish-owner.testnet`; on-chain `merchant_id` is the separate role account `dsh-merchant-desk.deepfish-owner.testnet`.

Deployed v2 `dsh-merchant-v2.deepfish-owner.testnet` WASM SHA-256 `6dd52d1115cf4134958854e679c2e685a0949de17f6421e29034e1e09f43703d` (NEAR code hash `8PjySGU8MWsvciY2DjKGwabi2tdhWYo51MkyDKyNZboz`, block `276598575`) matched local `target/wasm32-unknown-unknown/release/deepfish_merchant_economy.wasm` at branch time (cargo build, no `wasm-opt`). Testnet mint, order, and sale on v2 are final; see `docs/ONCHAIN_ECONOMY_PROOF.md`. Old v1 `dsh-merchant-v1` SHA-256 `4a8560e1672b47b6912c12f82d7b708d0a7c6e41ab939c5c07470bd41f7cf1ad` lacks resolver/storage fixes. Rust suite at branch time: 46 passed. Earlier Sandbox passes used a `wasm-opt` build; this exact unoptimized v2 binary fails Sandbox `new` with `PrepareError: Deserialization`, so Sandbox does not cover the deployed bytes. Not NEP-245 proof.

Use `storage_deposit` with `{"account_id":"..."}`. Key `id` is ignored and credits the caller.

Current local WASM SHA-256 (rebuilt 2026-11-07, rustc 1.99.1): `86fbc4ad61ec5d71ad4ae755656034ef6cb7bb718346eed8505934340d368541` (includes receipt-verified `mint_catch`). It differs from deployed v2, which has no `mint_catch`/`settlement_key` — a redeploy is required before the session-key settlement path can run on-chain. Deployed v1 WASM fetched read-only at block `276587398` has SHA-256 `4a8560e1672b47b6912c12f82d7b708d0a7c6e41ab939c5c07470bd41f7cf1ad`, NEAR code hash `61u8Z12Pi1AcbekbvAEst7jp4Am2JJLG7JG2baMmZLRJ`. Bytes differ: deployed code does not include local resolver/storage changes. Rust suite: 59 passed (was 52; +7 new: receipt-verified `mint_catch` — valid settlement, replay, bad signature, wrong catcher, missing key, owner-only key set, short key); Sandbox economy and transfer-call suites previously passed but were NOT re-run in this sandbox — the local `neard` refuses to start here (it requires file-descriptor limit 65535, container hard limit is 4096 and cannot be raised even as root). Not NEP-245 proof.

### NEP-245 findings

Current RPC `view_code` fetch at block `276587398` gives deployed SHA-256 `4a8560e1672b47b6912c12f82d7b708d0a7c6e41ab939c5c07470bd41f7cf1ad` and NEAR code hash `61u8Z12Pi1AcbekbvAEst7jp4Am2JJLG7JG2baMmZLRJ`. It confirms prior recorded code hash. Current local artifact SHA-256 differs; source changes are not deployed.

- **Transfer-call receiver Sandbox passes locally.** Actual receiver WASM tests unused return, callback panic, invalid response, attempted retransfer while unresolved, and acceptance. It does not validate Testnet deployment or storage callback failures.
- **Compatibility limits — batch/self transfers.** `validate_batch` rejects empty batches, duplicate IDs, and batches over 10; `mt_transfer_internal` rejects self-transfer. Core requires equal array lengths and leaves these cases unspecified; these extra restrictions need interoperability tests/documentation, not proof of noncompliance by themselves.
- **Storage refund callback runtime still untested.** Rust tests cover failed `storage_withdraw` restoring credit and unregister retaining registration until successful refund; `registration_only` excess refund resolves asynchronously. Sandbox does not yet force NEAR transfer failure in these storage paths.
- **Storage accounting — rule implemented and unit-tested, invariant proof still open.** `charge_storage_delta` charges every per-token balance/metadata write to its owner from global `storage_usage()` deltas; the probe-measured registration minimum covers one pending callback entry. A write the owner cannot cover panics with `Insufficient storage balance` instead of minting an unfunded entry (unit-tested: minting to a player funded only with the minimum fails). Rule: fund accounts above the minimum before minting or receiving; the Sandbox `call()` helper tops up exactly the reported shortfall. Interleaved storage operations still need invariant proof, and Testnet runtime confirmation is still missing.
- **Resolver runtime verified locally:** failed callback, invalid JSON, and wrong-length response resolve as fully unused; receiver token balance stays reserved until callback. `sandbox-transfer-call.mjs` exercises return, failure, malformed response, attempted spend/retransfer, and acceptance in Sandbox. Batch permits max 10 and rejects duplicate IDs.
- **Metadata extension — view shape verified locally, on-chain serialization still open.** Missing tokens are reported as `None` in the same array position (`mt_metadata_token_all`, `mt_metadata_token_by_token_id`, `mt_metadata_base_by_token_id`, `mt_batch_supply`) — unit-tested. `mt_token` returns `owner_id: None` by design: the token is fungible across owners, so there is no single owner; the owner-scoped view is `mt_tokens_for_owner`. Exact on-chain view serialization still needs Testnet confirmation.
- **Events extension — mint + transfer asserted locally.** `mt_mint` log shape (`owner_id`, `token_ids`, string `amounts`, standard `nep245` v`1.0.0`) is now unit-tested alongside `mt_transfer`. Runtime log assertion on Testnet still open.
- **Compatibility limits — batch/self transfers (documented MVP limits).** `validate_batch` rejects empty batches, duplicate IDs, and batches over 10; `mt_transfer_internal` rejects self-transfer. All three batch rejections are unit-tested. Core requires equal array lengths and leaves these cases unspecified; these extra restrictions need interoperability tests/documentation, not proof of noncompliance by themselves.
- **Session-key settlement — implemented locally, not live.** `set_settlement_key` (owner only) stores the server ed25519 public key; `mint_catch` lets the catcher settle a server-signed receipt with their own function-call session key (predecessor must equal the catcher; receipt settles once; token ID is the receipt ID; standard `mt_mint` event). The signed message is `dsh-catch-v1\n{receipt_id}\n{player_id}\n{species_id}\n{title}`, signature and key hex-encoded. Rust tests cover valid settlement, replay, bad signature, wrong catcher, missing key, and owner-only key rotation — including a real ed25519 test vector, and the mocked `ed25519_verify` was proven to verify for real (a tampered signature fails). Two new struct fields (`settlement_key`, `used_receipts`) change the Borsh layout: prefer a fresh deploy over live state. The server receipt-signing endpoint and the catch → mint wiring are built (slice 2); the sell-flow wiring (transfer leg) and Testnet verification are still missing — see `docs/SETTLEMENT_SESSION_KEYS.md`.
- **Core interface:** amount strings, 1 yocto, holder-initiated transfers (sender = predecessor, balance-checked — not owner-only) and balance/supply views are present. Approval extensions unsupported (null-only); disclose. `ft_transfer_call` intentionally unsupported, unrelated to NEP-245 core.

### Transaction verification

Verified live transaction `EA4yhL4izzZtQBG1WLLUEQnVbaSgwVBf2A8wp82zeu3L` reached `FINAL` with success. Signer `dsh-player-v1.deepfish-owner.testnet`; method `accept_purchase_order`; order `order-1`; one `fish:fish-demo-0001`; seller claim 0.01 NEAR. Storage top-up `G2X3oGevwSDaXdMgo43yV4jZXqz2NfTxNgLfr3LNFJgw` finalized. First attempt `7uUEPRed84uDBtX9RsjHw5BWbm7rizUjPrVgCBiYQCtb` failed due to merchant-desk storage shortage; rollback verified; gas charged. Order now filled; do not repeat. Full RPC state/event evidence in `docs/ONCHAIN_ECONOMY_PROOF.md`.

Separate ABI issue (resolved for the current deployment): deployed v1's `storage_balance_of` RPC view accepted `{id: accountId}` and rejected `{account_id: accountId}`, but deployed v2 (built from `3bb0b09`) takes `{account_id}` like the current source, and the server sends `{account_id: accountId}` (`server/src/routes/near.js`) — all three agree now. The `{id}` form matters only if someone points the server at v1 again.

### Redeploy checklist (do NOT deploy without explicit owner approval)

1. Compare fresh local WASM SHA-256 against deployed code hash first; record both.
2. Verify Borsh state-schema compatibility between deployed code and the new WASM before deploying over live state. The deployed code predates local resolver/storage changes; if struct fields changed, deploying over live state can corrupt it — a fresh deploy or a migration may be required instead.
3. The current source's `storage_balance_of` takes `{account_id: ...}` (NEP-145 name), and the server already sends `{account_id: accountId}` — no server change is needed on redeploy. (The `{id}` form was only for deployed v1, now superseded.)
4. Re-run the Sandbox economy + transfer-call suites on a machine where `neard` can start (not this sandbox — see fd-limit note above), then re-verify the finalized Testnet sale flow on the new code hash before claiming anything.
5. No paid call, deployment, initialization, or funding without explicit approval.

Testnet storage deposit and one sale were sent and finalized as described above. No deployment or initialization was done in the v1 read-only pass (deployed v2 was deployed + initialized separately — see `docs/ONCHAIN_ECONOMY_PROOF.md`). No verified withdrawal; seller claim `0.01 NEAR` remains on contract per the last verified read (the owner's 2026-11-07 wd report is unverified — no hash supplied).

## Local checks

```sh
export RUSTUP_HOME=$HOME/workspace/tools/rustup CARGO_HOME=$HOME/workspace/tools/cargo PATH=$HOME/workspace/tools/cargo/bin:$PATH
cargo test --manifest-path contracts/merchant/Cargo.toml --lib -- --test-threads=1
contracts/merchant/build-wasm.sh
node contracts/merchant/sandbox.mjs
RUSTFLAGS='-C link-arg=--allow-undefined' cargo build --manifest-path contracts/merchant/test-receiver/Cargo.toml --locked --target wasm32-unknown-unknown --release
node_modules/.bin/wasm-opt contracts/merchant/test-receiver/target/wasm32-unknown-unknown/release/deepfish_nep245_test_receiver.wasm -o /tmp/receiver-opt.wasm -O --llvm-memory-copy-fill-lowering --strip-target-features
cp /tmp/receiver-opt.wasm contracts/merchant/test-receiver/target/wasm32-unknown-unknown/release/deepfish_nep245_test_receiver.wasm
node contracts/merchant/sandbox-transfer-call.mjs
```

Receiver script uses `wasm-opt` just like merchant `build-wasm.sh`; ensure receiver WASM is optimized before Sandbox run. Build hashes change with source/toolchain. Sandbox proves local behavior only; deployed Testnet WASM remains older. Storage callbacks, accounting invariants, and full standards review remain blockers. No compliance claim or deployment without separate review and approval.
