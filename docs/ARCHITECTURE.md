# Deep Sea Hunter Architecture

## Status boundaries

- Gameplay, controls, progression, Guest save and existing Boat Hub tabs passed headless desktop/mobile browser checks. Physical-device performance is UNVERIFIED.
- Offline Guest uses browser `dsh.save.v2`. Online Guest uses Fastify/PostgreSQL. They remain separate.
- Online economy: browser gets an Online Guest session from Fastify; catches submit hunt/shot IDs and species, which the server validates against cooldown (minimum shot interval), population, shot limit, and duplicate shot IDs before issuing receipts in PostgreSQL. Market reads receipts, open orders and prices; sale atomically marks receipt sold, credits player CR, debits merchant treasury, and updates stock, demand and ledger. All persistence is PostgreSQL; off-chain CR balances never convert to NEAR; on-chain merchant order prices are derived from CR through the fixed bridge 1 CR = 0.0005 NEAR (`server/src/services/ticks.js`). Requires reachable API and PostgreSQL.
- Fast Forward is SIMULATED locally: seven days in one minute. It changes no save, backend row or blockchain state. Track 09 loop: ~30-second dive/catch cycles; 60-second population/market ticks (~5 minutes is the player-facing loop cadence); per-session sale, progression and market-history decisions.
- NEAR tab exposes merchant state, storage deposit, sell, and withdrawal calls against configured Testnet merchant. UI asks wallet to sign, then checks transaction signer, receiver, method, finality and merchant receipts through Testnet RPC; chain state loads automatically once a wallet is connected (`autoSync`); a manual SYNC ON-CHAIN refresh remains available. Three merchant sales (v1, v2 order-1, and the e2e UI sale), a storage top-up, and one withdrawal are verified final on Testnet; full evidence in `docs/ONCHAIN_ECONOMY_PROOF.md`. Mint is live two ways: operator auto-mint (verified on v2 Testnet) and receipt-verified session-key `mint_catch` (local only — deployed v2 has no `mint_catch`, needs a redeploy). NEP-245 compliance is unverified.
- Google/Email identity is NOT IMPLEMENTED. Disabled controls do not authenticate. Guest remains playable.

## NEAR boundaries

Wallet Selector is optional for explicit NEAR actions. Normal gameplay does not require wallet, seed phrase, popup or gas. The deployed `deepfish-contract.testnet` NFT contract is separate and untouched.

`contracts/merchant/` is a separate prototype. Local WASM build present; the Sandbox economy suite passed previously but was not re-run in this sandbox; current local WASM SHA-256 `fdaa8915e6a8f236db1da627bb7adbdd3ac9408a90c3c9bc5a6be2925b98646f` (rebuilt 2026-11-10, includes `mint_catch` + order relist; the `95def789…` build is superseded). Three merchant sales (v1, v2 order-1, and the e2e UI sale), a storage top-up, and one withdrawal are verified final on Testnet; full evidence in `docs/ONCHAIN_ECONOMY_PROOF.md`. NEP-245 blockers remain; local build/Sandbox do not prove compliance.

## Merchant audit blockers

Cross-contract receiver behavior lacks runtime receiver integration. Event JSON has source serialization but no exact runtime-log assertion. Storage minimum measures registration bytes, not per-token balance/metadata growth. Metadata JSON ABI and token ownership representation need official-spec verification. Resolver rollback/failure behavior is unit-tested only and needs runtime validation. Batch length/approval checks exist, but hard size/duplicate restrictions and arithmetic/edge behavior need compatibility review.

## Data flow

```text
Offline Guest → browser local save → offline Fish Market
Online Guest → Fastify session → validated catch → PostgreSQL receipt
  → market quote/order → atomic sale → player CR + merchant treasury/stock/demand/ledger (off-chain)
NEAR tab → Testnet wallet signature → merchant contract → RPC finality/receipt check → sync contract state
Fast Forward → local deterministic simulation → display only
```

Public demo note: the Render static site serves game files only. Online economy needs publicly hosted API and PostgreSQL; Testnet actions also need configured merchant account and a user's Testnet wallet.

See `README.md` for run commands, `ROADMAP.md` for blockers, and `docs/ONCHAIN_ECONOMY_PROOF.md` for evidence rules.
