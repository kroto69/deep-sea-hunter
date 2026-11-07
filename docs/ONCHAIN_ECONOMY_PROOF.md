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

A fresh read-only `view_code` at block `276587398` fetched deployed WASM. Its SHA-256 is `4a8560e1672b47b6912c12f82d7b708d0a7c6e41ab939c5c07470bd41f7cf1ad`; NEAR code hash is `61u8Z12Pi1AcbekbvAEst7jp4Am2JJLG7JG2baMmZLRJ`, matching sale receipt code hash. Current local rebuilt WASM SHA-256 is `e134c5a7dfd86d949c6a9652ea1c32242e902490b51fdf8dd09662c01b1519b9`; bytes differ because local code includes un-deployed resolver/storage changes. No new code was deployed.

This verifies one actual Testnet storage deposit and one successful merchant sale—not general NEP-245 compliance, deployed/local byte-for-byte equivalence, production readiness, or another method. Do not retry settled order; it is filled. Backend game credits remain PostgreSQL off-chain. Existing `deepfish-contract.testnet` is a separate collectibles contract.

## Verification after explicit authorization

Before another paid call, first check whether earlier transaction is final or failed; do not retry while status is unknown. After standards audit and owner approval for any deploy/init/funding, independently verify on NEAR Testnet:

1. Contract account, deployed code/hash and initialization state.
2. Real finalized transaction hash and Explorer URL.
3. Signer, method, arguments, receipts and success status.
4. Before/after `ft_balance_of`, `mt_balance_of`, supply and relevant merchant/treasury state from RPC/view calls.
5. Match the finalized state to the UI's displayed transaction and balances.

Keep raw RPC/Explorer evidence and label network/environment. No new deployment, initialization, funding, or retry is authorized by this document; verify existing transaction status before any retry.
