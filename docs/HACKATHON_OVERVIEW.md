# Deep Sea Hunter — Project Overview

Deep Sea Hunter is a first-person Three.js diving game. Players explore reefs, catch fish, manage oxygen/equipment, and return to the Boat Hub. It has an offline Guest save and an Online Guest backend; online credits are separate from local saves.

## Current features

- Underwater gameplay, fish behavior, speargun, oxygen, progression, and tutorial are available.
- Boat Hub includes Fish Market, Equipment, Missions, Dive Zones, and progression records.
- One deterministic Dock Merchant posts orders based on stock, demand, prices, and treasury limits. The backend validates catch receipts and sales.
- Fish sales reduce Merchant Treasury and increase Player Balance. Game Treasury is a separate ledger. These systems are off-chain.
- Browser checks are documented for desktop `1280×720` and mobile landscape `844×390`. They do not prove real-phone FPS or performance.

## Identity and wallet

**Player Account** means a future Google/Email game account for identity, sessions, and cross-device progress. It is not implemented. NEAR Auth is not used.

**Guest Account** allows play without external identity. Offline Guest saves in the browser; Online Guest has a separate backend session/player. Guest does not yet have cloud sync.

**Player Wallet** is an optional NEAR wallet, currently including Meteor Wallet. It manages a NEAR address and signs NFT transactions. It is not game login; Google/Email does not create a wallet, and disconnecting a wallet should not log a player out of a game account.

**Contract Account** is the NEAR account where the NFT program runs (`deepfish-contract.testnet`). **Owner Account** (`deepfish-owner.testnet`) administers contract functions. Neither is a game balance.

**Merchant NPC** is an automated backend buyer. It has needs, inventory, orders, and internal treasury. It is not a NEAR account and makes no blockchain transactions.

**Game Treasury** is an internal game ledger, separate from Player Balance, Merchant Treasury, player wallet, and contract.

## NFTs and evidence limits

Testnet contract deployment/initialization and read-only metadata have transaction/evidence details in `PROJECT_STATUS.md`. Contract source and collectible page provide NFT/marketplace operations; unit/sandbox tests do not prove player transactions on Testnet.

There is currently no verified flow linking a unique capture to a one-time mint. Mint metadata is generic and does not prove species, rarity, or capture. Current backend rarity covers only common/uncommon/rare for selected economic species; the Common–Legendary capture-rarity system is still planned.

No Testnet mint, listing, buy, or transfer is claimed. Real wallet interaction requires owner approval.

## Not yet available / future direction

- Google OAuth and Email OTP: planned; waiting for credentials and email delivery provider.
- Permanent player profiles and cross-device cloud saves: planned.
- Mobile portrait and real-device optimization: require testing.
- Capture identity, five-tier rarity, one-time NFT mint: require design and implementation.
- Player-to-player marketplace: separate work from the current Merchant Market.
- Deep Sea Hunter memecoin: future only, not MVP; no creation without owner approval.

## Ledger flow

```text
Online fish catch → validated receipt → Dock Merchant purchase
Merchant Treasury ↓                         Player Balance ↑
Upgrade/zone/reward → separate Game Treasury ledger
NFT transaction → Player Wallet ↔ NEAR Contract (separate from game credits)
```

For implementation and test coverage, see `PROJECT_STATUS.md` and `../ROADMAP.md`.
