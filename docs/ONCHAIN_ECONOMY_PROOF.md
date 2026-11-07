# On-chain Economy Evidence

## Verified Testnet activity

RPC `https://rpc.testnet.near.org` returned chain ID `testnet`. This section is the v1 read-only pass: finalized preflight and postflight checks; no deployment or initialization in that pass. (The v2 deploy + initialization below was a separate, later step.)

Successful merchant sale:
- Transaction: `EA4yhL4izzZtQBG1WLLUEQnVbaSgwVBf2A8wp82zeu3L`
- Explorer: https://explorer.testnet.near.org/transactions/EA4yhL4izzZtQBG1WLLUEQnVbaSgwVBf2A8wp82zeu3L
- Finality: `FINAL`; transaction status `SuccessValue`; merchant receipt success.
- Signer `dsh-player-v1.deepfish-owner.testnet`; receiver `dsh-merchant-v1.deepfish-owner.testnet`.
- Method `accept_purchase_order`; args `{"order_id":"order-1","amount":"1"}`; attached deposit 1 yoctoNEAR.
- Deployed code hash at transaction receipt: `61u8Z12Pi1AcbekbvAEst7jp4Am2JJLG7JG2baMmZLRJ`.
- Receipt emitted `EVENT_JSON` `nep245` / `mt_transfer`, token `fish:fish-demo-0001`, amount `1`, seller to merchant desk.
- Finalized RPC views: seller token balance `0`, merchant token balance `1`; seller claim `10000000000000000000000` yoctoNEAR (0.01 NEAR); order quantity `0` and inactive; merchant inventory `1`; `accounting_invariant=true`.

Required storage top-up:
- Transaction `G2X3oGevwSDaXdMgo43yV4jZXqz2NfTxNgLfr3LNFJgw`, final successful; `storage_deposit` added `0.001 NEAR` to merchant desk storage on behalf of seller.
- Explorer: https://explorer.testnet.near.org/transactions/G2X3oGevwSDaXdMgo43yV4jZXqz2NfTxNgLfr3LNFJgw
- Final merchant desk storage total `9470000000000000000000` yoctoNEAR, available `870000000000000000000`.

Failed first sale attempt:
- Transaction `7uUEPRed84uDBtX9RsjHw5BWbm7rizUjPrVgCBiYQCtb`, final failure: merchant desk lacked `130000000000000000000` yoctoNEAR storage.
- Explorer: https://explorer.testnet.near.org/transactions/7uUEPRed84uDBtX9RsjHw5BWbm7rizUjPrVgCBiYQCtb
- RPC confirmed atomic rollback: seller token remains 1, merchant token 0, claim 0, order active. Gas fee was charged.

A fresh read-only `view_code` at block `276587398` fetched deployed WASM. Its SHA-256 is `4a8560e1672b47b6912c12f82d7b708d0a7c6e41ab939c5c07470bd41f7cf1ad`; NEAR code hash is `61u8Z12Pi1AcbekbvAEst7jp4Am2JJLG7JG2baMmZLRJ`, matching sale receipt code hash. The v1 bytes differ from the current source. The resolver/storage fixes shipped in v2, covered below.

This verifies one actual Testnet storage deposit and one successful merchant sale—not general NEP-245 compliance, deployed/local byte-for-byte equivalence, production readiness, or another method. Do not retry settled order; it is filled. Backend game credits remain PostgreSQL off-chain. Existing `deepfish-contract.testnet` is a separate collectibles contract.

## Merchant v2 Testnet flow

Contract `dsh-merchant-v2.deepfish-owner.testnet`. Final `view_code` at block `276598575`: NEAR code hash `8PjySGU8MWsvciY2DjKGwabi2tdhWYo51MkyDKyNZboz`, SHA-256 `6dd52d1115cf4134958854e679c2e685a0949de17f6421e29034e1e09f43703d`. That matched local `contracts/merchant/target/wasm32-unknown-unknown/release/deepfish_merchant_economy.wasm` byte for byte at deploy time (cargo build, no `wasm-opt`). The current local build differs — SHA-256 `86fbc4ad…` (rebuilt 2026-11-07, includes `mint_catch`) — so the match is historical, not current.

| Step | Transaction | Result |
|---|---|---|
| Deploy + `new` | `6uUoCAoddxmxAsMzDUufbjdtiLrvyC86fxnLbqoKcxbG` | FINAL, `SuccessValue` |
| Storage: owner, desk, treasury | `J2fpMLizrtzsDuBMvPB86boS5mq7hcTXe173vo98emQP`, `CHb3UMZfCi2ZiJqsKrJCGLWVEjeM7ZNE7tZB9maUrAbu`, `AbHiDorpXtFHN6xDhLUfscrSzukTs1u8bZGXWg8U1SKN` | succeeded |
| Storage top-up player 0.02 NEAR | `2XP2JfUvhZrV6v4bcQAYYd2ZpMZH56YzHkWVxUT5jK6Q` | succeeded |
| `mint_asset` `fish:test-fish-001` to player | `2pqUogkLHs87YrPErYJAgoZ4Dp8WsjfPCPTncVh7SGwT` | FINAL, all receipts success |
| `create_purchase_order` `order-1`, 1 × 0.01 NEAR | `3y4F7JY6hbcF4bLuPCnF1pgWVuHo8bVDMP1VQpsj8CBu` | FINAL, all receipts success |
| `accept_purchase_order` by player | `HzMGu8uSf8it5B4w8CyhNCzzTh95vKFQfPf9NhGmvFNm` | FINAL, all receipts success |

The sale receipt emitted `EVENT_JSON` `nep245` `mt_transfer` for `fish:test-fish-001`, amount `1`, from player to `dsh-merchant-desk.deepfish-owner.testnet`. Final RPC views after the sale:
- player balance `0`, desk balance `1`
- `order-1` inactive with quantity `0`; `reserved_orders` `0`
- player `seller_claim` `10000000000000000000000` (0.01 NEAR)
- `treasury_available` `990000000000000000000000`; `accounting_invariant` `true`

Failed attempts, all rolled back with only gas charged:
- `3eiVK9RvLZZQS5UsjusbHh3YhhSBtSqojbsDK8tqRv45`, `6UnRjTDHvGuoRVw3Lq7yCxDj26uDDUmp6CjvSjyyBQFR`: no 1 yocto deposit.
- `4hposQ5wE4GhctQWQuyYoWppZtoyE27Myydxxyr4oCgN`: player not registered.
- `F1oiMSbXEGkj21CnYs4dS9C1qe2jHPm14juL5C4fU6bh`: owner storage not registered.
- `GVd5ac24woqXJFKJKnWQ4pZQXEqphPaytNr8vkzEjoWJ`: player storage short.
- `7xRFX9nVur9nkyqTtArnebBnPXvGva4yUogqR7sRYS2B`: player `register` returned already registered.

Warning: `storage_deposit` with key `id` instead of `account_id` credits the caller (`8nXFm2Ph…`, `231wDNoh…`, `HE6FE841…`). Those deposits added 0.3 NEAR to the contract account's own storage balance.

V2 `order-1` is filled, so don't retry it. `withdraw_proceeds` is now verified — see the auto-mint section below (tx `CQ8eSUfjDhjEuRnFnsnFfj3rCA4ucD4P9SfC6Sxc3mWu`, 0.009 NEAR to `flatrice4664.testnet`).

## Server-side auto-mint and merchant agent

Player flow needs no wallet popup to mint. The server signs `mint_asset` with the Testnet operator
account, using the key at `~/.near-credentials/testnet/<NEAR_MERCHANT_OWNER_ID>.json`. No private key
is stored in `.env`, this repo, or any migration.

Prerequisites verified on Testnet:

- `storage_deposit` for `flatrice4664.testnet`: `CGAxFr7CU74rhpyvNsfgJr6CRJV4533Ly6CDiymjKhnA`, total 0.1 NEAR.
- RPC `https://test.rpc.fastnear.com` reports `chain_id=testnet`. `https://rpc.testnet.near.org` is deprecated and returns HTTP 429, which silently broke every chain view.

Signer-path proof (server code, not a UI session):

- Mint `39MA8pybrJbs7RiPwe71SzZ7sbJVXzZGPt69Xn2dq9gb` FINAL, `mt_mint` event for `fish:catch-e2e-1794044371726`, `mt_balance_of` = 1.
- Order `21DLCzejiTPJLju6Ccj1kEtufZ9rYa9wGdUAoGqFHJXt` FINAL, reserve 0.009 NEAR, `treasury_available` 0.99 → 0.981 NEAR.
- Player sale and withdraw through the UI — VERIFIED 2026-11-07 (read directly from Nearblocks Testnet, both FINAL + Success):
  - Sale: `2er8mzfvHt7k5Se3QV5ub7TyqvSHFtFooTpfTPCSvDoH`, block 276613988, 2026-11-07 09:42:24 UTC. Signer `flatrice4664.testnet`, receiver `dsh-merchant-v2.deepfish-owner.testnet`. Method `accept_purchase_order`, args `{"amount":"1","order_id":"order-fish:catch-e2e-1794044371726"}`. Receipt emitted NEP-245 `mt_transfer` for `fish:catch-e2e-1794044371726`, amount 1, player → merchant desk.
  - Withdraw: `CQ8eSUfjDhjEuRnFnsnFfj3rCA4ucD4P9SfC6Sxc3mWu`, block 276614062, 2026-11-07 09:43:07 UTC (~43 s after the sale). Signer `flatrice4664.testnet`, receiver `dsh-merchant-v2.deepfish-owner.testnet`. Method `withdraw_proceeds`; receipt transferred 0.009 NEAR contract → player, and `resolve_withdrawal` returned true (`{"amount":"9000000000000000000000","seller":"flatrice4664.testnet"}`).
  - The reported state values are confirmed: `mt_balance_of` player 1 → 0, merchant desk 0 → 1, `merchant_inventory` = 1, order `active=false`, `reserved_orders` 0, `paid_out` 0.009 NEAR, `seller_claim` 0, `accounting_invariant` true. (The player also received ~0.100268 NEAR of storage refunds from system receipts inside the same two transactions — refunded storage, not sale proceeds.)
  - Both transactions hit `dsh-merchant-v2` — no redeploy happened; the merged branch code (with `mint_catch`) is still not live on-chain.

Rules the server enforces:

- Mint happens only after every off-chain hunt rule passed, and only after the DB transaction committed.
- `asset_id` is `catch-<receipt uuid>`; the contract rejects a repeat, so a retried mint cannot double supply.
- Mint is skipped, not failed, when the player has no bound wallet or no on-chain storage registration.
- Orders are keyed per token (`order-fish:<asset>`), because `create_purchase_order` ties an order to one `token_id`. One order per token for life.
- Price bridge is fixed at 1 CR = 0.0005 NEAR; the CR price itself stays dynamic (population, demand, stock, quality).
- A catch that already has a token can no longer be sold for CR, so one fish cannot be paid twice.
- When `treasury_available` cannot cover one unit, the agent reports `broke` and places no order.

## Verification after explicit authorization

Before another paid call, first check whether earlier transaction is final or failed; do not retry while status is unknown. After standards audit and owner approval for any deploy/init/funding, independently verify on NEAR Testnet:

1. Contract account, deployed code/hash and initialization state.
2. Real finalized transaction hash and Explorer URL.
3. Signer, method, arguments, receipts and success status.
4. Before/after `ft_balance_of`, `mt_balance_of`, supply and relevant merchant/treasury state from RPC/view calls.
5. Match the finalized state to the UI's displayed transaction and balances.

Keep raw RPC/Explorer evidence and label network/environment. No new deployment, initialization, funding, or retry is authorized by this document; verify existing transaction status before any retry.
