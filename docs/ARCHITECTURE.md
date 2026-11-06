# Deep Sea Hunter Architecture

## Current systems

### Game and saves

The game runs in the browser using Three.js and JavaScript modules. Gameplay, controls, fish AI, oxygen, equipment, and local progression use the `dsh.save.v2` save. Local saves are not automatically cloud-saved.

### Players and sessions

- **Player Account**: a future cross-device game identity using Google/Email. Not available yet.
- **Guest Account**: play without external login. Offline Guest data stays in the browser. Online Guest receives a player row and bearer session in Fastify/PostgreSQL; this is not a permanent cross-device identity.
- **Player Profile**: online economy data belongs to a separate player row. Google/Email profiles do not exist yet.
- **Cloud Save**: cross-device progression sync is not available.

### Economy

Online Guest uses Fastify and PostgreSQL. The backend manages sessions, validated catch receipts, player balance, inventory, equipment, missions, zones, and settlement. Catch validation is labeled `client_simulated_validated`; it is not proof of physical action or full anti-cheat.

One deterministic Dock Merchant has treasury, inventory, demand, and orders. Its tick uses existing species/population data and budget/order/reserve limits. Selling requires a valid quote and a receipt owned by the player; the backend locks related records and writes transaction/ledger entries atomically.

The three ledgers are separate:

1. **Player Balance**: off-chain funds owned by a player profile.
2. **Merchant Treasury**: Merchant budget for buying fish from players.
3. **Game Treasury**: internal game ledger for existing upgrades/zones/rewards.

Fish sales debit the Merchant and credit the Player. Game Treasury is not a wallet balance or Merchant Treasury. Offline credits and saves remain local and separate from backend data.

### NEAR and NFTs

- **Player Wallet**: Meteor Wallet or another Wallet Selector provider. Controls a NEAR account and signs blockchain actions. Optional; not game login and not required to play.
- **Contract Account**: `deepfish-contract.testnet`, the account where the NFT contract runs.
- **Owner Account**: `deepfish-owner.testnet`, the administrator initialized in the contract. Owner authority differs from a player wallet.
- **NFT**: an on-chain asset separate from ordinary fish, game credits, and Merchant ledger. Displaying a wallet account does not prove backend identity; NEP-413 binds a wallet to a session separately.

The contract was deployed and initialized on NEAR Testnet according to evidence recorded in `PROJECT_STATUS.md`. Source contains NFT and marketplace methods; this does not prove mint/list/buy/transfer transactions occurred or that UI passed end-to-end. Current contract mint accepts generic metadata and does not prove a fish or rarity came from a game capture.

## Current flows

```text
Offline Guest: browser gameplay → local dsh.save.v2 → offline Fish Market
Online Guest: browser → Fastify session → PostgreSQL player/profile → catch receipt → Dock Merchant quote/sale → Player + Merchant ledgers
Wallet: player selects provider → Meteor/NEAR Wallet → explicit signing → Testnet contract
```

Wallet flow is separate from Guest/account authentication. Google/Email account login and cloud saves do not exist yet. Disconnecting a wallet is not intended to log out of a game account.

## Planned target

```text
Google/Email identity → backend account/session → player profile → cloud save
Guest remains available; no automatic merging
Player selects a capture → backend mint eligibility/unique claim → wallet signature → NFT contract
```

This requires account identity/session, email delivery and Google OAuth credentials, recovery rules, cloud-save conflict handling, provenance checks, and one-time mint linkage. Do not link accounts automatically because email addresses match; do not treat a Google account as a NEAR account.

## System boundaries

- Merchant Agent is neither a wallet nor a smart contract; it is deterministic and backend-controlled.
- Catch receipts are not NFTs.
- Prices, populations, orders, and game credits are off-chain.
- No project token/coin exists in the MVP.
- Testnet is not Mainnet; deployment is not proof of real marketplace transactions.
