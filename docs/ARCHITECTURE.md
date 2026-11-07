# Deep Sea Hunter Architecture

## Status boundaries

- Gameplay, controls, progression, Guest save and existing Boat Hub tabs passed headless desktop/mobile browser checks. Physical-device performance is UNVERIFIED.
- Offline Guest uses browser `dsh.save.v2`. Online Guest uses Fastify/PostgreSQL. They remain separate.
- Online economy: browser gets an Online Guest session from Fastify; catches submit hunt/shot IDs and species, which server validates against cooldown, population and quotas before issuing receipts in PostgreSQL. Market reads receipts, open orders and prices; sale atomically marks receipt sold, credits player CR, debits merchant treasury, and updates stock, demand and ledger. All persistence is PostgreSQL; CR is off-chain and never converts to NEAR. Requires reachable API and PostgreSQL.
- Fast Forward is SIMULATED locally: seven days in one minute. It changes no save, backend row or blockchain state. Track 09 loop: ~30-second dive/catch cycles; ~5-minute population/market ticks; per-session sale, progression and market-history decisions.
- NEAR tab exposes merchant state, storage deposit, sell, and withdrawal calls against configured Testnet merchant. UI asks wallet to sign, then checks transaction signer, receiver, method, finality and merchant receipts through Testnet RPC; state requires `SYNC ON-CHAIN`. One sale is independently verified; evidence in `docs/ONCHAIN_ECONOMY_PROOF.md`. Mint remains disabled; NEP-245 compliance is unverified.
- Google/Email identity is NOT IMPLEMENTED. Disabled controls do not authenticate. Guest remains playable.

## NEAR boundaries

Wallet Selector is optional for explicit NEAR actions. Normal gameplay does not require wallet, seed phrase, popup or gas. The deployed `deepfish-contract.testnet` NFT contract is separate and untouched.

`contracts/merchant/` is a separate prototype. Local WASM build and Sandbox economy pass; SHA-256 `95def7894af73741aa87d1a1a0ceb14c75011b047382288a5882a2ae664be32d`. One `accept_purchase_order` sale and storage top-up verified final on Testnet; full evidence in `docs/ONCHAIN_ECONOMY_PROOF.md`. NEP-245 blockers remain; local build/Sandbox do not prove compliance.

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

Public demo note: static Vercel hosting serves game files only. Online economy needs publicly hosted API and PostgreSQL; Testnet actions also need configured merchant account and a user's Testnet wallet.

See `README.md` for run commands, `ROADMAP.md` for blockers, and `docs/ONCHAIN_ECONOMY_PROOF.md` for evidence rules.
