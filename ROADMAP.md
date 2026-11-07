# Deep Sea Hunter — Roadmap and Readiness

| Area | Status | Evidence boundary |
|---|---|---|
| Existing gameplay and Boat Hub tabs | DONE / TESTED | Headless desktop/mobile regression passed; physical-device performance UNVERIFIED. |
| Online demo economy | IMPLEMENTED / TESTED | All 19 fish, distinct per-fish base price and merchant demand; PostgreSQL integration tests passed with isolated schemas. Settlement stays off-chain. |
| Fast Forward | SIMULATED / TESTED | Deterministic local seven-day timeline; no persisted/backend/chain mutations. Simulates merchant bankruptcy and optional reopening investment. |
| Merchant bankruptcy + investment | IMPLEMENTED / TESTED (unit + Fast Forward; DB integration written, needs `TEST_DATABASE_URL`) | Close on sale/tick when available balance reaches reserve floor; reopen only via `POST /api/market/invest` with enough CR. Off-chain CR only; NEAR merchant unaffected. |
| Mothership marketplace (player shops) | IMPLEMENTED LOCALLY / TESTED (unit; DB integration written, needs `TEST_DATABASE_URL`) | Slice 1 backend done 2026-11-07 (owner chose "langsung bangun slice pertama" over the earlier park decision): 500 CR license, listing/delist, atomic player-to-player sale, escrow from merchant sales, shop listings counted as market supply in the tick. Design in `docs/MARKETPLACE_MOTHERSHIP.md`. Still missing: hub UI (slice 2), Fast Forward shop simulation, license NFT mint, shop tiers/fees, on-chain settlement of shop sales (needs the receipt-signing endpoint). |
| Player-to-player fish trading ("player-owned markets") | IMPLEMENTED LOCALLY / TESTED (backend slice 1; UI pending) | Slice 1 of the marketplace IS this: players list caught fish (receipts) at their own price; another player buys with CR; the trade is one atomic receipt↔CR swap on the ledger (no double-sell, no buying an already-sold listing). Player-set prices sit alongside merchant pricing — this is what makes the market player-owned and lets the economy evolve without a dev patch. Hub UI is slice 2; on-chain settlement needs the receipt-signing endpoint. |
| NEAR tab | PARTIAL / UNVERIFIED | Configured merchant state, storage, sell, and withdrawal UI calls exist; no RPC-final transaction evidence in this review. Mint disabled. |
| Google/Email | NOT IMPLEMENTED | Disabled placeholders; provider and delivery absent. |
| Merchant NEP-245 | INCOMPLETE / UNVERIFIED | Rust suite 59/59 (mint event, metadata missing-shape, batch limits, storage funding rule, receipt-verified `mint_catch` unit-tested); Sandbox suites previously passed, not re-run here (`neard` fd-limit blocked). Remaining: Testnet redeploy (needs approval + Borsh schema check — new `settlement_key`/`used_receipts` fields — + `storage_balance_of` arg fix), runtime receiver/storage/event confirmation, independent review. |
| Session-key settlement | IMPLEMENTED LOCALLY / UNVERIFIED | Contract `mint_catch` + `js/session-key.js` (grant/revoke/background calls/outbox) done and tested locally; design in `docs/SETTLEMENT_SESSION_KEYS.md`. Slice 2 done 2026-11-07: server receipt-signing endpoint (`POST /api/near/receipt-signature`, seed in `SETTLEMENT_SIGNING_KEY`) + catch → mint wiring in `js/online.js` (background settle, localStorage pending queue, chain-tab status). Missing: sell/buy transfer leg (`mt_transfer` after a CR sale), Testnet verification (AddKey per wallet, 1-yocto rule, allowance burn rate), withdrawal flow. |
| Existing NFT contract | DONE / TESTED (historical deployment) | Separate contract; unchanged. |

## Remaining verification

1. Compare fresh local WASM SHA-256 `95def7894af73741aa87d1a1a0ceb14c75011b047382288a5882a2ae664be32d` against deployed code; no deploy performed.
2. Complete NEP-245 core/metadata/events/storage audit, receiver runtime tests, exact event-log checks, and resolver/storage edge tests. No compliance claim before independent review.
3. Re-run PostgreSQL integration and browser suites after further source changes; current checks pass on disposable test schemas.
4. Verify configured Testnet merchant code/state, then each transaction's finalized hash, receipts, and before/after RPC views. Do not infer success from wallet return or UI.
5. Do not deploy, initialize, fund, or retry paid transactions without explicit approval and verified current state.
6. Google/Email login remains roadmap-only as requested.

See README for reviewer runbook and evidence details.
