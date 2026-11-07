# Merchant contract prototype

Separate merchant contract prototype. Existing collectibles contract is untouched. Testnet `accept_purchase_order` sale and storage top-up were submitted from `dsh-player-v1.deepfish-owner.testnet` and verified final by RPC; hashes and state evidence recorded below and in `docs/ONCHAIN_ECONOMY_PROOF.md`. This is not evidence of NEP-245 compliance or deployment readiness.

## Status: NEP-245 partial, not verified compliant

Read-only RPC audit recorded deployed code hash `61u8Z12Pi1AcbekbvAEst7jp4Am2JJLG7JG2baMmZLRJ`; finalized merchant sale later used this code hash and transferred one `fish:fish-demo-0001` into `dsh-merchant-desk.deepfish-owner.testnet`, creating 0.01 NEAR seller claim. Storage top-up `G2X3oGevwSDaXdMgo43yV4jZXqz2NfTxNgLfr3LNFJgw` also finalized. App uses contract account `dsh-merchant-v1.deepfish-owner.testnet`; on-chain `merchant_id` is the separate role account `dsh-merchant-desk.deepfish-owner.testnet`.

Current local WASM SHA-256: `e134c5a7dfd86d949c6a9652ea1c32242e902490b51fdf8dd09662c01b1519b9`. Deployed WASM fetched read-only at block `276587398` has SHA-256 `4a8560e1672b47b6912c12f82d7b708d0a7c6e41ab939c5c07470bd41f7cf1ad`, NEAR code hash `61u8Z12Pi1AcbekbvAEst7jp4Am2JJLG7JG2baMmZLRJ`. Bytes differ: deployed code does not include local resolver/storage changes. Rust suite: 46 passed; Sandbox economy and transfer pass. Not NEP-245 proof.

### NEP-245 findings

Current RPC `view_code` fetch at block `276587398` gives deployed SHA-256 `4a8560e1672b47b6912c12f82d7b708d0a7c6e41ab939c5c07470bd41f7cf1ad` and NEAR code hash `61u8Z12Pi1AcbekbvAEst7jp4Am2JJLG7JG2baMmZLRJ`. It confirms prior recorded code hash. Current local artifact SHA-256 differs; source changes are not deployed.

- **Transfer-call receiver Sandbox passes locally.** Actual receiver WASM tests unused return, callback panic, invalid response, attempted retransfer while unresolved, and acceptance. It does not validate Testnet deployment or storage callback failures.
- **Compatibility limits — batch/self transfers.** `validate_batch` rejects empty batches, duplicate IDs, and batches over 10; `mt_transfer_internal` rejects self-transfer. Core requires equal array lengths and leaves these cases unspecified; these extra restrictions need interoperability tests/documentation, not proof of noncompliance by themselves.
- **Storage refund callback runtime still untested.** Rust tests cover failed `storage_withdraw` restoring credit and unregister retaining registration until successful refund; `registration_only` excess refund resolves asynchronously. Sandbox does not yet force NEAR transfer failure in these storage paths.
- **Storage accounting risk.** `charge_storage_delta` uses global `storage_usage()` deltas. Registration minimum reserves callback map space, but persistent pending map entries are charged to token account and callback storage temporarily consumes that credit. Contract reserve/payer responsibility and interleaved storage operations still need invariant proof.
- **Resolver runtime verified locally:** failed callback, invalid JSON, and wrong-length response resolve as fully unused; receiver token balance stays reserved until callback. `sandbox-transfer-call.mjs` exercises return, failure, malformed response, attempted spend/retransfer, and acceptance in Sandbox. Batch permits max 10 and rejects duplicate IDs.
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
RUSTFLAGS='-C link-arg=--allow-undefined' PATH=/tmp/dsh-cargo/bin:$PATH RUSTUP_HOME=/tmp/dsh-rustup CARGO_HOME=/tmp/dsh-cargo RUSTUP_TOOLCHAIN=stable cargo build --manifest-path contracts/merchant/test-receiver/Cargo.toml --locked --target wasm32-unknown-unknown --release
node_modules/.bin/wasm-opt contracts/merchant/test-receiver/target/wasm32-unknown-unknown/release/deepfish_nep245_test_receiver.wasm -o /tmp/receiver-opt.wasm -O --llvm-memory-copy-fill-lowering --strip-target-features
cp /tmp/receiver-opt.wasm contracts/merchant/test-receiver/target/wasm32-unknown-unknown/release/deepfish_nep245_test_receiver.wasm
PATH=/tmp/dsh-cargo/bin:$PATH RUSTUP_HOME=/tmp/dsh-rustup CARGO_HOME=/tmp/dsh-cargo RUSTUP_TOOLCHAIN=stable node contracts/merchant/sandbox-transfer-call.mjs
```

Receiver script uses `wasm-opt` just like merchant `build-wasm.sh`; ensure receiver WASM is optimized before Sandbox run. Build hashes change with source/toolchain. Sandbox proves local behavior only; deployed Testnet WASM remains older. Storage callbacks, accounting invariants, and full standards review remain blockers. No compliance claim or deployment without separate review and approval.
