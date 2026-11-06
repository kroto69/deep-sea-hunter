# Deep Sea Hunter — Project Status

This status reflects available source and recorded test evidence. `DONE` means implemented. `TESTED` names the evidence scope. `PARTIAL` means only part of the flow exists. `SIMULATED` is not real external interaction. See `../ROADMAP.md` for work sequence.

## Feature status

| Feature | Status | Evidence / limits |
|---|---|---|
| Underwater gameplay, fish AI, speargun, oxygen, progression | DONE / TESTED | Three.js source and browser/unit regressions exist; not measured across all devices. |
| Guest and `dsh.save.v2` | DONE / TESTED | Offline Guest and Online Guest sessions are separate. Guest session is not a permanent account. |
| Welcome Screen and tutorial | DONE / TESTED | Five-step tutorial, skip/replay, and save persistence; browser smoke recorded at desktop `1280×720` and mobile landscape `844×390`. |
| Boat Hub / Fish Market | DONE / TESTED | Offline/online tabs; Hub and merchant smoke on desktop/mobile landscape. |
| Merchant and off-chain settlement | DONE / TESTED | One deterministic Dock Merchant; backend integration tests cover quote, budget, replay, rollback, and ledger. Player, Merchant, and Game Treasury are separate. |
| Google/Email Player Account | PLANNED / BLOCKED | No provider identity, OAuth, OTP, or account profile yet. Google credentials and email delivery provider are not configured. No NEAR Auth. |
| Cloud Save | PLANNED | Online backend stores data per session/player; offline-save sync across devices is not implemented. |
| Meteor Wallet | PARTIAL / SIMULATED | Wallet Selector integration and UI exist. Mock browser checks do not prove real Meteor connection, signing, or disconnect. |
| NEAR Testnet contract | DONE / TESTED read-only | Deployment/init and read-only metadata evidence are documented below. This is not marketplace end-to-end testing. |
| NFT mint/list/buy/transfer | PARTIAL / BLOCKED | Contract source, sandbox/unit tests, and collectible page exist. User transactions end-to-end are unproven; wallet approval is required. |
| Capture-linked NFT, rarity-at-catch, one-time mint | PLANNED | No server-backed provenance/claim flow. Contract metadata explicitly says capture provenance is not verified. |
| Mobile landscape | DONE / TESTED headless | Browser viewport `844×390`, not a physical phone. FPS, memory, and thermals are unmeasured. |
| Mobile portrait | PARTIAL / PLANNED | Rotate hint exists; portrait gameplay usability is unproven. |
| Memecoin | FUTURE | Not in MVP; no token created and no tokenomics approved. |

## Gameplay and UI

Core gameplay, Boat Hub, merchant order display, offline save, and tutorial exist in source. `tests/boat-hub.mjs` and `tests/welcome-tutorial.mjs` cover desktop and mobile landscape viewports. These results do not prove physical-device performance. Welcome provides Guest and wallet access; Google remains disabled. Email login is not available.

## Backend and economy

Fastify/PostgreSQL handles Online Guest sessions, player data, catch receipts, progression, one deterministic Dock Merchant, quotes, sales, and ledger. Fish sales debit Merchant Treasury and credit Player Balance. Game Treasury is separate. Offline local economy is not automatically synced or mixed with backend data.

Repository documentation records a prior 27/27 backend test run and successful online browser smoke on desktop/mobile. Rerun tests before release; historical results are not a test run performed by this status update.

## NEAR Testnet evidence

Previously recorded deployment details:

- Contract account: `deepfish-contract.testnet`.
- Owner account from initialization arguments: `deepfish-owner.testnet`.
- Deploy transaction: `m4TJCE54k9qchVgHXQKbTUXzkEKFRgv8qVDxjkTRHke`.
- Initialization transaction: `3FCMdJ6qb8uAQDNRhSA9t9pfKKgshc9epycza3MUzudZ`.
- Deployed WASM SHA-256: `afb2bf590cc5b0d410e055386c9d714751f74f45b75dd3f53445477a8a63b3ae`.
- Read-only RPC metadata and code verification are recorded in the earlier status report.

This is historical deployment/metadata evidence, not a fresh RPC verification performed by this documentation update. No deploy, mint, listing, buy, transfer, or signing occurred in this update.

Contract source contains owner-only mint, NFT transfer, marketplace listing/buy/delist, and withdrawal. Unit/sandbox tests are recorded; do not infer end-to-end Testnet user transactions. Current mint accepts generic metadata and does not attest a server-backed capture ID or five-tier rarity.

## Wallet and player accounts

Meteor Wallet remains optional and separate from game authentication. Wallet UI tests previously used a mock selector; disconnected read-only probes are `SIMULATED`, not proof of a real Meteor connection. NEP-413 is wallet-to-session binding, not Google/Email login. Google/Email auth is not available and awaits provider credentials/configuration and secure session design.

## Next work

1. Configure Google OAuth credentials/callback and an email OTP delivery provider.
2. Design secure account sessions, logout, recovery, identity uniqueness, and no automatic merging.
3. Implement player accounts/profiles and cloud saves with conflict handling.
4. Test real wallet interaction only with explicit approval; do not transact without it.
5. Design capture identity, rarity-at-catch, and one-time mint authorization before contract changes.
6. Test mobile devices for portrait/landscape, memory, and FPS.

No game source, smart contract, ledger, or database was changed for this status update.
