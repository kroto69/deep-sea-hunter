# Project Status

## Summary

Gameplay/Boat Hub: headless desktop/mobile browser regressions passed. Online economy covers all 19 fish; isolated PostgreSQL integration tests pass, settlement remains off-chain. Fast Forward: local-only simulation, now including merchant bankruptcy and optional reopening investment. Merchant bankruptcy + investment: implemented (close on sale/tick at reserve floor, reopen only via `POST /api/market/invest`); unit and Fast Forward tests pass, DB integration test written but not run in this sandbox (no PostgreSQL; needs `TEST_DATABASE_URL`). Merchant Testnet: one real `accept_purchase_order` sale plus storage deposit verified final by RPC; exact hashes and state evidence in `docs/ONCHAIN_ECONOMY_PROOF.md`. Mint disabled. NEP-245 audit blockers remain; this does not prove compliance. Google/Email: NOT IMPLEMENTED by request.

## Evidence

- Testnet `accept_purchase_order` tx `EA4yhL4izzZtQBG1WLLUEQnVbaSgwVBf2A8wp82zeu3L`: `FINAL`, success receipt, NEP-245 transfer event, and post-state verified by RPC. Seller received 0.01 NEAR claim; filled order, balances and accounting invariant recorded in `docs/ONCHAIN_ECONOMY_PROOF.md`.
- Testnet merchant storage deposit tx `G2X3oGevwSDaXdMgo43yV4jZXqz2NfTxNgLfr3LNFJgw`: `FINAL`, 0.001 NEAR attached.
- Merchant UI now submits storage deposit, order sale, and proceeds withdrawal through the connected Testnet wallet, verifies transaction finality/receipt through RPC, and offers manual verification for redirect-wallet hashes. Tested local API verification against the finalized sale hash; fresh UI wallet signing still needs user test.
- With `TEST_DATABASE_URL` on disposable local PostgreSQL: `npm test` passed, 29 tests, 0 skipped, 0 failed.
- `git diff --check`, JavaScript syntax checks, fast-forward tests, and wallet action tests pass.
- Disposable-schema integration suite verifies all 19 fish fixtures and transactional economy paths.
- `tests/online-smoke.mjs`: desktop/mobile market settlement, treasury, Guest/offline isolation and Testnet config passed; five world/game browser suites passed.
- Merchant Rust suite rerun with isolated `CARGO_TARGET_DIR`: 43 passed, 0 failed; not NEP-245 compliance evidence.
- Fresh merchant WASM build passes with `-C link-arg=--allow-undefined`; SHA-256: `95def7894af73741aa87d1a1a0ceb14c75011b047382288a5882a2ae664be32d`.
- `contracts/merchant/sandbox.mjs` passes local mint/order/sale/withdraw and accounting checks. Sandbox is not Testnet or NEP-245 compliance evidence.

## NEP-245 blockers

No cross-contract receiver runtime test; no exact runtime event log assertion; per-token storage growth is underfunded; storage refunds lack async failure recovery; metadata JSON ABI/ownership representation need audit; resolver rollback requires runtime verification; batch cap/duplicate behavior and edge semantics need compatibility audit. Do not claim NEP-245 compliance or deploy.

## Chain evidence

Testnet sale `EA4yhL4izzZtQBG1WLLUEQnVbaSgwVBf2A8wp82zeu3L` and storage top-up `G2X3oGevwSDaXdMgo43yV4jZXqz2NfTxNgLfr3LNFJgw` verified final via RPC. One sale filled `order-1`, transferred `fish:fish-demo-0001`, created 0.01 NEAR seller claim, and kept accounting invariant true. First sale attempt `7uUEPRed84uDBtX9RsjHw5BWbm7rizUjPrVgCBiYQCtb` failed final from merchant storage shortfall; rollback verified and gas charged. Do not retry filled order. Existing collectibles contract `deepfish-contract.testnet` remains separate and untouched. Merchant NEP-245 compliance still unverified; no deployment or initialization was done. Google/Email has no provider; Guest remains available.

See README reviewer instructions and `docs/ONCHAIN_ECONOMY_PROOF.md` for verification requirements.
