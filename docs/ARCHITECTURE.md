# Deep Sea Hunter Architecture

## Status boundaries

- Gameplay, controls, progression, Guest save and existing Boat Hub tabs passed headless desktop/mobile browser checks. Physical-device performance is UNVERIFIED.
- Offline Guest uses browser `dsh.save.v2`. Online Guest uses Fastify/PostgreSQL. They remain separate.
- Online demo economy accepts all 19 fish in `js/fish.js`; per-fish base prices and merchant demand are seeded in PostgreSQL. Receipts, stock, demand, and CR settlement stay off-chain. Unit and isolated PostgreSQL integration tests pass.
- Fast Forward is SIMULATED locally. It changes no save, backend row or blockchain state.
- NEAR tab exposes merchant state, storage deposit, sell, and withdrawal calls against configured Testnet merchant. Returned hashes are labelled SUBMITTED · FINALITY UNVERIFIED until finality and RPC state are checked. One Testnet sale is independently verified; evidence in `docs/ONCHAIN_ECONOMY_PROOF.md`. Mint remains disabled; NEP-245 compliance is unverified.
- Google/Email identity is NOT IMPLEMENTED. Disabled controls do not authenticate. Guest remains playable.

## NEAR boundaries

Wallet Selector is optional for explicit NEAR actions. Normal gameplay does not require wallet, seed phrase, popup or gas. The deployed `deepfish-contract.testnet` NFT contract is separate and untouched.

`contracts/merchant/` is a separate prototype. Local WASM build and Sandbox economy pass; SHA-256 `95def7894af73741aa87d1a1a0ceb14c75011b047382288a5882a2ae664be32d`. One `accept_purchase_order` sale and storage top-up verified final on Testnet; full evidence in `docs/ONCHAIN_ECONOMY_PROOF.md`. NEP-245 blockers remain; local build/Sandbox do not prove compliance.

## Merchant audit blockers

Cross-contract receiver behavior lacks runtime receiver integration. Event JSON has source serialization but no exact runtime-log assertion. Storage minimum measures registration bytes, not per-token balance/metadata growth. Metadata JSON ABI and token ownership representation need official-spec verification. Resolver rollback/failure behavior is unit-tested only and needs runtime validation. Batch length/approval checks exist, but hard size/duplicate restrictions and arithmetic/edge behavior need compatibility review.

## Data flow

```text
Offline Guest → browser save → local Fish Market
Online Guest → Fastify session → PostgreSQL receipts/merchant → off-chain credits
Optional wallet → explicit NEAR signing → separate deployed NFT or future authorized merchant contract
Fast Forward → local deterministic state → display only
```

See `README.md` for run commands, `ROADMAP.md` for blockers, and `docs/ONCHAIN_ECONOMY_PROOF.md` for evidence rules.
