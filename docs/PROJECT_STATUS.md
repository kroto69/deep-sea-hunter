# Project Status

## Summary

Gameplay/Boat Hub: headless desktop/mobile browser regressions passed. Online economy covers all 19 fish; isolated PostgreSQL integration tests pass, settlement remains off-chain. Fast Forward: local-only simulation, now including merchant bankruptcy and optional reopening investment. Merchant bankruptcy + investment: implemented (close on sale/tick at reserve floor, reopen only via `POST /api/market/invest`); unit and Fast Forward tests pass, DB integration test written but not run in this sandbox (no PostgreSQL; needs `TEST_DATABASE_URL`). Merchant Testnet: three real `accept_purchase_order` sales (v1 demo token, v2 order-1 sale, v2 catch token) plus storage deposit verified final by RPC; exact hashes and state evidence in `docs/ONCHAIN_ECONOMY_PROOF.md`. Mint live two ways: operator auto-mint (verified on v2 Testnet) and receipt-verified session-key `mint_catch` (local, needs a redeploy); record-mint prevents a tokenized fish being sold off-chain for CR. NEP-245 audit blockers remain; this does not prove compliance. Google/Email: NOT IMPLEMENTED by request.

## Evidence

- Testnet `accept_purchase_order` tx `EA4yhL4izzZtQBG1WLLUEQnVbaSgwVBf2A8wp82zeu3L`: `FINAL`, success receipt, NEP-245 transfer event, and post-state verified by RPC. Seller received 0.01 NEAR claim; filled order, balances and accounting invariant recorded in `docs/ONCHAIN_ECONOMY_PROOF.md`.
- Testnet merchant storage deposit tx `G2X3oGevwSDaXdMgo43yV4jZXqz2NfTxNgLfr3LNFJgw`: `FINAL`, 0.001 NEAR attached.
- Merchant UI now submits storage deposit, order sale, and proceeds withdrawal through the connected Testnet wallet, verifies transaction finality/receipt through RPC, and offers manual verification for redirect-wallet hashes. Tested local API verification against the finalized sale hash; fresh UI wallet signing still needs user test.
- Earlier run with `TEST_DATABASE_URL` on disposable local PostgreSQL: `npm test` passed, 29 tests, 0 skipped, 0 failed (before the suite grew). Current suite, verified 2026-11-07 without a database (`npm test` runs `node --test server/test/*.test.js` only): 31 tests, 25 passed, 0 failed, 6 skipped (the 6 skipped are DB integration tests, which need `TEST_DATABASE_URL`).
- `git diff --check`, JavaScript syntax checks, fast-forward tests, and wallet action tests pass.
- Disposable-schema integration suite verifies all 19 fish fixtures and transactional economy paths.
- `tests/online-smoke.mjs`: desktop/mobile market settlement, treasury, Guest/offline isolation and Testnet config passed; five world/game browser suites passed.
- Earlier run — merchant Rust suite rerun with isolated `CARGO_TARGET_DIR`: 43 passed, 0 failed; not NEP-245 compliance evidence. (Current suite: 59 passed, 0 failed, verified 2026-11-07.)
- Merchant Rust suite 2026-11-07 (rustc 1.99.1, persistent toolchain `~/workspace/tools/cargo`): 52 passed, 0 failed — 6 new tests (mint `EVENT_JSON`, metadata missing-token shape, batch duplicate/>10/empty rejections, storage-funding rule). Not NEP-245 compliance evidence.
- Earlier merchant WASM build (superseded; the current local build is `86fbc4ad…`, see the session-key bullet below) passed with `-C link-arg=--allow-undefined`; SHA-256: `95def7894af73741aa87d1a1a0ceb14c75011b047382288a5882a2ae664be32d`.
- Fresh merchant WASM rebuild 2026-11-07 (rustc 1.99.1): SHA-256 `86fbc4ad…` (via `build-wasm.sh`, incl. `wasm-opt`). An earlier non-`wasm-opt` rebuild hashed `f1a14f1c…`; it is superseded. Sandbox economy + transfer-call suites NOT re-run here: local `neard` refuses to start (fd limit 65535 required, container hard limit 4096, unchangeable even as root). No deployment performed.
- Session-key settlement slice 2026-11-07 (design `docs/SETTLEMENT_SESSION_KEYS.md`): contract `set_settlement_key` + receipt-verified `mint_catch` (server ed25519 signature over `dsh-catch-v1` message, receipt settles once, token ID is the receipt ID); Rust suite 52 → 59 passed, 0 failed; frontend `js/session-key.js` (one-approval AddKey grant, revoke, background calls, outbox; near-api-js@5.1.1 via esm.sh, verified 200 OK). Fresh WASM SHA-256 `86fbc4ad61ec5d71ad4ae755656034ef6cb7bb718346eed8505934340d368541`. Slice 2 done 2026-11-07 (server receipt-signing endpoint + catch → mint wiring + record-mint `POST /api/near/record-mint`); still missing: Testnet verification of the session-key path and the sell/buy transfer leg; no deployment performed.
- Earlier run — `contracts/merchant/sandbox.mjs` passes local mint/order/sale/withdraw and accounting checks (not re-run in this sandbox; see the bullet above). Sandbox is not Testnet or NEP-245 compliance evidence.

## NEP-245 blockers

No cross-contract receiver runtime test; no exact runtime event log assertion; per-token storage growth is underfunded; storage refunds have async failure recovery (`resolve_storage_transfer`, unit-tested) but no Testnet runtime proof; interleaved-operation invariant proof still missing; metadata JSON ABI/ownership representation need audit; resolver rollback requires runtime verification; batch cap/duplicate behavior and edge semantics need compatibility audit. Do not claim NEP-245 compliance or deploy.

## Chain evidence

Testnet sale `EA4yhL4izzZtQBG1WLLUEQnVbaSgwVBf2A8wp82zeu3L` and storage top-up `G2X3oGevwSDaXdMgo43yV4jZXqz2NfTxNgLfr3LNFJgw` verified final via RPC. One sale filled `order-1`, transferred `fish:fish-demo-0001`, created 0.01 NEAR seller claim, and kept accounting invariant true. First sale attempt `7uUEPRed84uDBtX9RsjHw5BWbm7rizUjPrVgCBiYQCtb` failed final from merchant storage shortfall; rollback verified and gas charged. Do not retry filled order. Existing collectibles contract `deepfish-contract.testnet` remains separate and untouched. Merchant NEP-245 compliance still unverified; no deployment or initialization was done in this (v1 read-only) pass. Deployed v2 was deployed + initialized separately — see `docs/ONCHAIN_ECONOMY_PROOF.md`. Google/Email has no provider; Guest remains available.

See README reviewer instructions and `docs/ONCHAIN_ECONOMY_PROOF.md` for verification requirements.
