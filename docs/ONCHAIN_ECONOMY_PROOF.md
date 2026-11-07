# On-chain Economy Evidence

## Verified Testnet activity

RPC `https://rpc.testnet.near.org` returned chain ID `testnet`. Read-only finalized preflight and postflight checks; no deployment or initialization.

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

Contract `dsh-merchant-v2.deepfish-owner.testnet`. Final `view_code` at block `276598575`: NEAR code hash `8PjySGU8MWsvciY2DjKGwabi2tdhWYo51MkyDKyNZboz`, SHA-256 `6dd52d1115cf4134958854e679c2e685a0949de17f6421e29034e1e09f43703d`. That matches local `contracts/merchant/target/wasm32-unknown-unknown/release/deepfish_merchant_economy.wasm` byte for byte (cargo build, no `wasm-opt`).

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

V2 `order-1` is filled, so don't retry it. `withdraw_proceeds` is not tested yet.

## Verification after explicit authorization

Before another paid call, first check whether earlier transaction is final or failed; do not retry while status is unknown. After standards audit and owner approval for any deploy/init/funding, independently verify on NEAR Testnet:

1. Contract account, deployed code/hash and initialization state.
2. Real finalized transaction hash and Explorer URL.
3. Signer, method, arguments, receipts and success status.
4. Before/after `ft_balance_of`, `mt_balance_of`, supply and relevant merchant/treasury state from RPC/view calls.
5. Match the finalized state to the UI's displayed transaction and balances.

Keep raw RPC/Explorer evidence and label network/environment. No new deployment, initialization, funding, or retry is authorized by this document; verify existing transaction status before any retry.
