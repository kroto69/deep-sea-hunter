# Deep Sea Hunter — Project Overview

Deep Sea Hunter is a first-person Three.js diving game. Players explore reefs, catch fish, manage oxygen/equipment, and return to the Boat Hub. It has an offline Guest save and an Online Guest backend; online credits are separate from local saves.

## Track 09 game loop

- **Every ~30 seconds:** dive a requested habitat, catch fish while managing oxygen/ammo, then return with a validated catch receipt. Server checks cooldown, population, species quota, and duplicate shot IDs.
- **Every ~5 minutes:** market tick recalculates stock/demand prices, expires old orders, creates treasury-bounded buy orders, and regenerates habitat populations. Player chooses whether to sell now for CR or hold inventory and target scarce/high-demand species next dive.
- **Per session:** review price reasoning, complete several dives and sales, buy progression upgrades, inspect merchant stock/treasury/history, and compare market outcomes. Fast Forward previews seven simulated days in one minute; it is local-only and does not alter online economy or chain.

## Current features

- Underwater gameplay, fish behavior, speargun, oxygen, progression, and tutorial are available.
- Boat Hub includes Fish Market, Equipment, Missions, Dive Zones, and progression records.
- Online demo supports catching all 19 fish in `js/fish.js`. Each fish has its own seeded base price and merchant demand. Depleted demand lowers price on a later market tick; Fast Forward previews a separate seven-day simulation in one minute.
- Dock Merchant validates catch receipts; selling raises merchant stock, reduces demand and merchant treasury, and raises Player Balance. All CR/accounting stays PostgreSQL off-chain.
- Browser checks are documented for desktop `1280×720` and mobile landscape `844×390`. They do not prove real-phone FPS or performance.

## Identity and wallet

**Player Account** means a future Google/Email game account for identity, sessions, and cross-device progress. It is not implemented. NEAR Auth is not used.

**Guest Account** allows play without external identity. Offline Guest saves in the browser; Online Guest has a separate backend session/player. Guest does not yet have cloud sync.

**Player Wallet** is optional for NEAR actions. It manages a NEAR address and signs wallet transactions. It is not game login; Google/Email does not create a wallet. A wallet response alone does not verify transaction finality.

**Collectibles Contract Account** is the separate NFT account (`deepfish-contract.testnet`). **Merchant config** may point to `dsh-merchant-v1.deepfish-owner.testnet`; previous read-only audit recorded deployed state, but this pass did not re-query it. Neither is a game balance.

**Merchant NPC** is an automated backend buyer. It has needs, inventory, orders, and internal treasury. It is not a NEAR account and makes no blockchain transactions.

**Game Treasury** is an internal game ledger, separate from Player Balance, Merchant Treasury, player wallet, and contract.

## NFTs and evidence limits

Historical collectibles deployment details remain in `PROJECT_STATUS.md`; they do not verify merchant activity. Collectible page provides NFT/marketplace operations; unit/Sandbox tests do not prove player transactions on Testnet.

There is currently no verified flow linking a unique capture to a one-time mint. One merchant sale finalized on Testnet (`accept_purchase_order`); this does not link a game catch to a token mint. Mint metadata does not prove species, rarity, or capture. Capture rarity progression remains future work.

This review does not verify any Testnet mint, listing, buy, or transfer. Check finalized RPC/Explorer status before claiming a transaction. New deployment, initialization, or funding requires owner approval.

## Not yet available / future direction

- Google OAuth and Email OTP: planned; waiting for credentials and email delivery provider.
- Permanent player profiles and cross-device cloud saves: planned.
- Mobile portrait and real-device optimization: require testing.
- Capture identity, five-tier rarity, one-time NFT mint: require design and implementation.
- Player-to-player marketplace: separate work from the current Merchant Market.
- Deep Sea Hunter memecoin: future only, not MVP; no creation without owner approval.
- Merchant NEP-245 compliance, catch-backed minting, and confirmed Testnet trade flow: unverified; see `../contracts/merchant/README.md`.

## Ledger flow

```text
Online fish catch → validated receipt → Dock Merchant purchase
Merchant Treasury ↓                         Player Balance ↑
Upgrade/zone/reward → separate Game Treasury ledger
NFT transaction → Player Wallet ↔ NEAR Contract (separate from game credits)
```

For implementation and test coverage, see `PROJECT_STATUS.md` and `../ROADMAP.md`.
