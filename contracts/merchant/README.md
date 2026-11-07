# Merchant contract prototype

Separate merchant contract prototype. Existing collectibles contract is untouched. Testnet `accept_purchase_order` sale and storage top-up were submitted from `dsh-player-v1.deepfish-owner.testnet` and verified final by RPC; hashes and state evidence recorded below and in `docs/ONCHAIN_ECONOMY_PROOF.md`. This is not evidence of NEP-245 compliance or deployment readiness.

## Status: NEP-245 partial, not verified compliant

Read-only RPC audit recorded deployed code hash `61u8Z12Pi1AcbekbvAEst7jp4Am2JJLG7JG2baMmZLRJ`; finalized merchant sale later used this code hash and transferred one `fish:fish-demo-0001` into `dsh-merchant-desk.deepfish-owner.testnet`, creating 0.01 NEAR seller claim. Storage top-up `G2X3oGevwSDaXdMgo43yV4jZXqz2NfTxNgLfr3LNFJgw` also finalized. App uses contract account `dsh-merchant-v1.deepfish-owner.testnet`; on-chain `merchant_id` is the separate role account `dsh-merchant-desk.deepfish-owner.testnet`.

Fresh local WASM build succeeds using `-C link-arg=--allow-undefined`; artifact SHA-256: `95def7894af73741aa87d1a1a0ceb14c75011b047382288a5882a2ae664be32d`. Local Sandbox economy test passes mint/order/sale/withdraw with balanced accounting. Testnet sale receipt reported deployed code hash `61u8Z12Pi1AcbekbvAEst7jp4Am2JJLG7JG2baMmZLRJ`; local artifact was not established as byte-for-byte match. Local Rust suite historical result: 43 passed; not NEP-245 proof.

### NEP-245 findings

- **BLOCKER — transfer-call rollback after receiver spends.** `mt_resolve_transfer` refunds `min(unused, receiver_balance)` and returns `requested-refund`. If receiver sends tokens onward before returning unused amount or failing, sender receives only receiver's remaining balance; transfer-call rollback is incomplete. Current tests cover receiver failure without spending, not this case. Add receiver-runtime tests and prevent or correctly account for onward transfers during unresolved calls.
- **Compatibility limits — batch/self transfers.** `validate_batch` rejects empty batches, duplicate IDs, and batches over 10; `mt_transfer_internal` rejects self-transfer. Core requires equal array lengths and leaves these cases unspecified; these extra restrictions need interoperability tests/documentation, not proof of noncompliance by themselves.
- **BLOCKER — asynchronous storage refunds.** `storage_withdraw` and `storage_unregister` reduce/remove storage balances before asynchronous NEAR transfer completes and have no refund resolver. On failed transfer, user credit is lost from contract state while NEAR returns to contract. Add pending-withdrawal state and resolver, matching safer proceeds-withdraw pattern. `storage_unregister(force=true)` refuses balances; NEP-145 permits contract to reject forced unregister, but document behavior.
- **Storage accounting risk.** `charge_storage_delta` uses global `storage_usage()` deltas and `mt_registered` usage counters. Per-operation snapshots may include contract-wide map entries and permanent mint metadata. Prove each account charge/refund and contract-level storage funding across transfer, mint, unregister, and failed promises; current tests don't establish lifecycle safety.
- **BLOCKER — transfer-call compatibility.** Callback failure and malformed JSON are treated as full unused, which is reasonable fail-safe, but resolver must restore sender's requested amount even when receiver has transferred some; current refund is capped to current receiver balance. Transfer-call has no actual cross-contract receiver runtime test. Batch permits max 10 and rejects duplicate IDs (above).
- **Metadata extension — not fully verified.** Source includes required base fields (`name`, `base_uri`) and contract spec/name. Verify exact on-chain view serialization and missing-token array shape against metadata extension; no runtime conformance test yet.
- **Events extension — gaps in tests.** Source mint log includes required `owner_id`, `token_ids`, and string `amounts`; existing event test checks transfer only. Add mint log serialization assertion.
- **Core interface:** amount strings, 1 yocto, owner-only transfer and balance/supply views are present. Approval extensions unsupported (null-only); disclose. `ft_transfer_call` intentionally unsupported, unrelated to NEP-245 core.

### Transaction verification

Verified live transaction `EA4yhL4izzZtQBG1WLLUEQnVbaSgwVBf2A8wp82zeu3L` reached `FINAL` with success. Signer `dsh-player-v1.deepfish-owner.testnet`; method `accept_purchase_order`; order `order-1`; one `fish:fish-demo-0001`; seller claim 0.01 NEAR. Storage top-up `G2X3oGevwSDaXdMgo43yV4jZXqz2NfTxNgLfr3LNFJgw` finalized. First attempt `7uUEPRed84uDBtX9RsjHw5BWbm7rizUjPrVgCBiYQCtb` failed due to merchant-desk storage shortage; rollback verified; gas charged. Order now filled; do not repeat. Full RPC state/event evidence in `docs/ONCHAIN_ECONOMY_PROOF.md`.

Separate ABI issue: the deployed contract's `storage_balance_of` RPC view accepts `{id: accountId}` and rejects `{account_id: accountId}`. Server currently sends `{id: accountId}`, matching deployed code but differing from NEP-145 method argument name. Keep live behavior explicit; fix only with a compatible contract/API update.

Testnet storage deposit and one sale were sent and finalized as described above. No deployment or initialization. No withdrawal; seller claim `0.01 NEAR` remains on contract.

## Local checks

```sh
PATH=/tmp/dsh-cargo/bin:$PATH RUSTUP_HOME=/tmp/dsh-rustup CARGO_HOME=/tmp/dsh-cargo RUSTUP_TOOLCHAIN=stable cargo test --manifest-path contracts/merchant/Cargo.toml --lib -- --test-threads=1
PATH=/tmp/dsh-cargo/bin:$PATH RUSTUP_HOME=/tmp/dsh-rustup CARGO_HOME=/tmp/dsh-cargo RUSTUP_TOOLCHAIN=stable contracts/merchant/build-wasm.sh
PATH=/tmp/dsh-cargo/bin:$PATH RUSTUP_HOME=/tmp/dsh-rustup CARGO_HOME=/tmp/dsh-cargo RUSTUP_TOOLCHAIN=stable node contracts/merchant/sandbox.mjs
```

Build artifact hash changes after source/toolchain changes. Sandbox proves local behavior only. Current blockers still prevent compliance claims or deployment.
