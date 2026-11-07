# Mothership marketplace — player shops inside the lobby hub

Status: SLICE 1 (backend) + SLICE 2 (hub UI) IMPLEMENTED LOCALLY (2026-11-07). Backend: license,
listings, escrow, player-to-player sale, and the supply rule. Hub UI: SHOPS
tab in the Boat Hub (license buy, list at own price, delist, buy, market
board). No on-chain settlement yet (needs the transfer leg — slice 3; the
server receipt-signing endpoint already exists). Not deployed, not verified
on Testnet. DB integration tests are written but need `TEST_DATABASE_URL`.

## The concept (owner, 2026-11-07)

The dev owns a mothership that serves as the lobby hub. Inside it is a
marketplace where players open a boat stall / shop. Opening a shop requires
buying a license (an NFT or equivalent). A shop sells the owner's caught fish
to other players.

## The supply/demand rule — yes, shop fish count

Shop fish DO affect supply and demand. One market, one price signal — the
merchant and the player shops are not two separate economies, or players
could arbitrage them against each other.

- **Supply:** the price engine's `marketStock` for a species is now
  **merchant stock + active shop listings** of that species. A fish listed
  in a shop is supply on the market, exactly like a fish sitting in the
  merchant's inventory. List 10 clownfish across player shops and the
  clownfish price is pushed down next tick, the same as if the merchant
  held 10. Delist or sell them and the supply drops back.
- **Demand (indirect, and this is the self-balancing loop):** merchant demand
  is what the merchant still wants to buy (`desired - merchant stock`). A
  fish that goes to a shop is a fish NOT sold to the merchant, so merchant
  demand stays unfulfilled and the merchant's price stays high — which
  attracts sellers back to the merchant. Shops and the merchant compete for
  the same fish, and the price is where they meet.
- **What shop listings do NOT do:** they never satisfy merchant demand (the
  merchant cannot buy from a shop in this slice), and they never change the
  habitat population (only catches do).

The rule lives in one place: `tick()` passes `marketStock = merchant
quantity + active shop listings` into the shared `nextPrice()` rule, and
`market_state.stock` stores that total so quotes and the WHY THIS PRICE?
reason show it.

## License

- One tier in this slice: a boat stall, `SHOP_LICENSE_PRICE_CR = 500` CR
  (in `js/economy-rules.js`, next to the other pricing rules — same scale as
  a zone unlock at 400 CR, roughly 28 clownfish sales). Tunable in one place.
- Bought once with CR (`POST /api/market/shops/license`). The CR goes to the
  game treasury (`game.main`) as a sink — it leaves the player economy, it
  does not go to the merchant. The purchase is a balanced ledger transaction
  (`shop_license`, player → game).
- A license never expires and cannot be resold in this slice. One license per
  player. Losing the license is not possible in this slice.
- The on-chain license NFT is a later step: the license is designed to become
  a token type in the existing merchant contract (no new contract needed),
  minted when the CR purchase settles. Slice 1 is off-chain only.

## Shops: list, delist, buy

- **List** (`POST /api/market/shops/list {receiptId, price}`): requires an
  active license. The receipt must be valid, unexpired, owned by the
  seller, and unsold. Price is the seller's own price in CR (1–1,000,000,000).
  One active listing per receipt (partial unique index).
- **Escrow:** a listed receipt cannot be sold to the merchant. The quote
  query excludes listed receipts, and `sell()` re-checks at settlement time
  (a receipt listed inside the 30-second quote window cannot be sold). The
  fish stays in the seller's inventory while listed — it is offered, not
  removed.
- **Delist** (`POST /api/market/shops/delist {listingId}`): seller only,
  active listings only. The fish returns to being an ordinary receipt
  (quotable and sellable to the merchant again). No money moves.
- **Buy** (`POST /api/market/shops/buy {listingId}`): one atomic database
  transaction. The buyer pays the seller in CR (balanced `shop_sale` ledger
  entry, player → player); the receipt and its inventory row move to the
  buyer, the seller's species quantity drops by one and the buyer's rises by
  one; the listing becomes `sold`. The buyer cannot be the seller. The buyer
  can then sell the fish to the merchant or list it in their own shop.
- **Fee:** none in this slice (0%). A fee to the merchant or game treasury
  is a decision point for a later slice, not a hidden default.
- **Idempotency:** every money-moving call takes the `idempotency-key`
  header, like the rest of the economy.

## On-chain settlement (not in this slice)

A shop sale is an off-chain CR trade in slice 1, with the receipt ID, price,
and both parties recorded — exactly what the session-key settlement needs.
The server receipt-signing endpoint already exists (slice 2,
`docs/SETTLEMENT_SESSION_KEYS.md`); what is still missing is only the
transfer leg (slice 3). Once it lands, the loop becomes: catch →
`mint_catch` (via the catcher's session key, at catch time) → shop sale
transfers the token with the seller's session key (`mt_transfer`, memo
carries the listing ID and price). Until then, do not claim shop sales
settle on-chain.

## What is NOT in slice 1

- Hub UI — DONE 2026-11-07 (slice 2): SHOPS tab in the Boat Hub — license panel, my-stall panel with delist, list-at-own-price (prefilled with the merchant's current price), market board with buy. Offline shows an online-only note.
- Fast Forward shop simulation.
- License NFT mint, shop tiers, fees, shop search/ranking.
- On-chain settlement of shop sales (slice 3): transfer leg not built; the receipt-signing endpoint already exists.

## Test evidence

- Unit tests (run locally): license price constant; `nextPrice` with shop
  listings in `marketStock` lowers the price versus merchant stock alone.
- Integration test `mothership marketplace` in
  `server/test/market.integration.test.js` (needs `TEST_DATABASE_URL`,
  skipped here like the other DB tests): license purchase + double-license
  rejection, listing escrow blocks merchant quote/sell, tick counts the
  listing in `market_state.stock`, shop sale moves CR + receipt + inventory
  atomically, delist re-opens the merchant quote, ledger stays balanced.
