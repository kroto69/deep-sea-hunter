# Deep Sea Hunter — Project Overview

Deep Sea Hunter is a first-person Three.js diving game. Players explore reefs, catch fish, manage oxygen/equipment, and return to the Boat Hub. It has an offline Guest save and an Online Guest backend; online credits are separate from local saves.

## Track 09 game loop

- **Every ~30 seconds:** dive a requested habitat, catch fish while managing oxygen/ammo, then return with a validated catch receipt. Server checks cooldown (minimum shot interval), population, shot limit, and duplicate shot IDs.
- **Every 60 seconds:** the market tick recalculates stock/demand prices, expires old orders, creates treasury-bounded buy orders, and regenerates habitat populations. ~5 minutes is the player-facing loop cadence: the player chooses whether to sell now for CR or hold inventory and target scarce/high-demand species next dive.
- **Per session:** review price reasoning, complete several dives and sales, buy progression upgrades, inspect merchant stock/treasury/history, and compare market outcomes. If sales drain the merchant treasury to its reserve floor (default 1000 CR), the shop closes as BANKRUPT and buys nothing until a player invests enough CR to lift it above the floor (`POST /api/market/invest`, also a button in the Market tab). Fast Forward previews seven simulated days in one minute, including bankruptcy and an optional reopening investment; it is local-only and does not alter online economy or chain.

## Current features

- Underwater gameplay, fish behavior, speargun, oxygen, progression, and tutorial are available.
- Boat Hub includes Fish Market, player Shops, Equipment, Missions, Dive Zones, progression records, and the NEAR tab.
- Online demo supports catching all 19 fish in `js/fish.js`. Each fish has its own seeded base price and merchant demand. Depleted demand lowers price on a later market tick; Fast Forward previews a separate seven-day simulation in one minute.
- Dock Merchant validates catch receipts; selling raises merchant stock, reduces demand and merchant treasury, and raises Player Balance. All CR/accounting stays PostgreSQL off-chain.
- Browser checks are documented for desktop `1280×720` and mobile landscape `844×390`. They do not prove real-phone FPS or performance.

## Identity and wallet

**Player Account** means a future Google/Email game account for identity, sessions, and cross-device progress. It is not implemented. NEAR Auth is not used.

**Guest Account** allows play without external identity. Offline Guest saves in the browser; Online Guest has a separate backend session/player. Guest does not yet have cloud sync.

**Player Wallet** is optional for NEAR actions. It manages a NEAR address and signs wallet transactions. It is not game login; Google/Email does not create a wallet. A wallet response alone does not verify transaction finality.

**Collectibles Contract Account** is the separate NFT account (`deepfish-contract.testnet`). **Merchant config** points to `dsh-merchant-v2.deepfish-owner.testnet` (deployed + verified on Testnet; see `docs/ONCHAIN_ECONOMY_PROOF.md`); v1 (`dsh-merchant-v1.deepfish-owner.testnet`) is superseded. Neither is a game balance.

**Merchant NPC** is an automated backend buyer. It has needs, inventory, orders, and internal treasury. It is not a NEAR account and makes no blockchain transactions. It goes bankrupt when its available balance reaches its reserve floor: the shop closes (no quotes, sales, or orders) until a player invests CR into its treasury. The rule lives in `js/economy-rules.js` (`isMerchantBankrupt` / `reopenAmountNeeded`), closure is detected on sale and on market tick, and investment is a balanced ledger transaction (`merchant_investment`, player → merchant).

**Game Treasury** is an internal game ledger, separate from Player Balance, Merchant Treasury, player wallet, and contract.

## NFTs and evidence limits

Historical collectibles deployment details remain in `PROJECT_STATUS.md`; they do not verify merchant activity. Collectible page provides NFT/marketplace operations; unit/Sandbox tests do not prove player transactions on Testnet.

A unique capture now links to a one-time mint two ways: operator auto-mint mints `fish:catch-{receipt}` on v2 Testnet (verified mint tx `39MA8pybrJbs7RiPwe71SzZ7sbJVXzZGPt69Xn2dq9gb`, see `docs/ONCHAIN_ECONOMY_PROOF.md` Merchant v2 — `2pqUogkLHs87YrPErYJAgoZ4Dp8WsjfPCPTncVh7SGwT` was the manual `mint_asset` of the test token `fish:test-fish-001`, not the auto-mint flow), and receipt-verified `mint_catch` mints `fish:{receipt}` from the player's session key (implemented locally, needs a redeploy — deployed v2 has no `mint_catch`). One merchant sale finalized on Testnet (`accept_purchase_order`); this does not link a game catch to a token sale — the sell/buy transfer leg is still missing. Mint metadata does not prove species, rarity, or capture. Capture rarity progression remains future work.

This review does not verify any Testnet listing, buy, or transfer. Check finalized RPC/Explorer status before claiming a transaction. New deployment, initialization, or funding requires owner approval.

## Not yet available / future direction

- Google OAuth and Email OTP: intentionally skipped — Guest play instead; the track's social/email login requirement is scored missing by design.
- Permanent player profiles and cross-device cloud saves: planned.
- Mobile portrait and real-device optimization: require testing.
- Capture identity and five-tier rarity: require design and implementation. One-time NFT mint is implemented (operator auto-mint verified on v2 Testnet; receipt-verified `mint_catch` local, needs redeploy).
- On-chain settlement of player-shop sales (slice 3, the transfer leg): not built yet. The marketplace itself (backend + SHOPS tab UI, slices 1–2) is built — see `docs/MARKETPLACE_MOTHERSHIP.md`; shop sales settle off-chain in CR for now.
- Deep Sea Hunter memecoin: future only, not MVP; no creation without owner approval.
- Merchant NEP-245 compliance: unverified. Catch-backed minting is partly verified (operator auto-mint verified on v2 Testnet; receipt-verified `mint_catch` local only, needs a redeploy), and the confirmed Testnet trade flow covers one merchant sale — the sell/buy transfer leg and Testnet verification of the session-key path are still missing; see `../contracts/merchant/README.md`.

## Ledger flow

```text
Online fish catch → validated receipt → Dock Merchant purchase
Merchant Treasury ↓                         Player Balance ↑
Upgrade/zone/reward → separate Game Treasury ledger
NFT transaction → Player Wallet ↔ NEAR Contract (separate from game credits)
```

For implementation and test coverage, see `PROJECT_STATUS.md` and `../ROADMAP.md`.
