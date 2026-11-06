# Deep Sea Hunter — Roadmap and Status

## Status summary

Statuses reflect available source and recorded test evidence. `DONE` means implemented; `TESTED` applies only to stated test coverage. Headless mobile tests are not physical-device tests.

| Area | Current status | Notes |
|---|---|---|
| Core gameplay, hunting, oxygen, equipment, progression | DONE / TESTED | Three.js source and gameplay regression checks are available. |
| Welcome Screen, Guest, tutorial | DONE / TESTED | Five-step tutorial, skip/replay, and progress saved in `dsh.save.v2`; desktop and mobile landscape smoke recorded. |
| Boat Hub, Fish Market, Missions, Dive Zones | DONE / TESTED | Hub tested on desktop and mobile landscape; offline and online economies remain separate. |
| Merchant NPC and backend economy | DONE / TESTED | One deterministic Dock Merchant. Backend validates orders, treasury limits, and settlement; this is not a player-to-player marketplace. |
| Player Account: Google/Email | PLANNED / BLOCKED | No account identity, OAuth, or OTP yet. Waiting for Google credentials and email delivery provider. Guest session is not a cross-device account. |
| Cloud Save / cross-device sync | PLANNED | Backend stores online data per player/session, but offline-save synchronization across devices does not exist. |
| Meteor Wallet | PARTIAL / SIMULATED | Wallet Selector and UI are integrated. UI tests used a mock; real connection/signing is unverified. Wallet is separate from game authentication. |
| NEAR Testnet contract | DONE / TESTED read-only | Deployment and initialization are documented with transaction evidence in `docs/PROJECT_STATUS.md`. This does not mean NFT flows passed end-to-end. |
| NFT mint/list/buy/transfer | PARTIAL / BLOCKED | Contract methods and collectible page exist. On-chain user transactions are not proven. Catch provenance and rarity mint flow are not implemented. |
| Mobile landscape | DONE / TESTED headless | Layout and smoke at 844×390. Real-device FPS is unmeasured. |
| Mobile portrait | PARTIAL / PLANNED | A rotate hint exists; portrait gameplay is not proven comfortable or complete. |
| Deep Sea Hunter memecoin | FUTURE | Not part of MVP. No token or tokenomics implementation. Owner approval required before work. |

## 1. Core Game and Economy — DONE / TESTED

- Underwater exploration, fish AI, environment, speargun, oxygen, equipment progression, and local save exist.
- Boat Hub includes Overview, Fish Market, Equipment, Missions, Dive Zones, Records, Storage, Workshop, and Collectibles.
- Online Guest uses separate sessions and backend ledger; offline save remains separate.
- Dock Merchant has needs/orders, inventory, prices, treasury limits, and transaction history. Fish sales move funds from Merchant Treasury to Player Balance; Game Treasury is separate.
- Not all hybrid-economy features exist: player-to-player marketplace and multiple NPC types are not available.

## 2. Player Account System — PLANNED

1. Keep Guest Mode.
2. Add Google OAuth and Email OTP/magic link only after credentials, email delivery, and secure session design are ready.
3. Create player profiles tied to provider identities. Never merge Guest/offline saves or provider accounts automatically.
4. Add cloud save and migration only with explicit rules and player consent.
5. Keep Meteor Wallet optional and separate. Disconnecting the wallet must not log out of the game account.

NEAR Auth is not used. Google/Email authentication is not implemented.

## 3. Mobile Experience — PARTIAL

- Responsive landscape UI and touch controls exist; automated browser checks are recorded at desktop `1280×720` and landscape `844×390`.
- Continue testing on real phones: touch usability, memory, thermal/performance behavior, FPS, and background/resume.
- Portrait gameplay is not a proven target. Decide between a rotate prompt and portrait layout after usability testing.

## 4. Fish Collection and NFT — PLANNED

Target: each capture receives an ID and rarity at capture time; rarity tiers are Common, Uncommon, Rare, Epic, Legendary; player chooses captures to mint; each capture can be minted once; metadata stores species, rarity, and capture ID. Ordinary fish stay off-chain and participate in the game economy.

Current state: the contract accepts `collectible-` token IDs, but uses generic metadata that explicitly says capture provenance is not verified. No server-backed capture identity → mint eligibility → one-time claim flow exists. Backend-seeded species currently use only common/uncommon/rare.

## 5. NFT Marketplace — PARTIAL

Contract source contains listing, buying/settlement, delisting, transfer, withdrawal, and access control. Collectibles page submits wallet transactions. Sandbox and unit tests exist. User transactions on Testnet and full browser flow are not proven; do not call the marketplace production-ready.

## 6. Deep Sea Hunter Token — FUTURE

Memecoin/tokenomics are future research only, not MVP. Do not deploy, mint, change game economy, or promise utility without owner approval and risk/legal review.

## Next steps

1. Provide Google OAuth configuration and email delivery provider; agree on secure sessions and account recovery.
2. Implement account profiles/sessions and test Guest, email, and Google isolation.
3. Design cloud saves without overwrite or automatic merge.
4. Test real Meteor Wallet behavior read-only first.
5. Design capture identity, rarity-at-catch, and one-time mint authorization before contract changes.
6. Test NFT transactions on Testnet only with explicit approval.
7. Test mobile landscape/portrait on real devices.
