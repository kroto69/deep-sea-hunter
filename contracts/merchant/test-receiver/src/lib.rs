use near_sdk::{env, ext_contract, json_types::U128, near, AccountId, PanicOnDefault, PromiseOrValue};

#[ext_contract(ext_merchant)]
trait Merchant {
    fn mt_transfer(&mut self, receiver_id: AccountId, token_id: String, amount: U128, approval: Option<(AccountId,u64)>, memo: Option<String>);
}

#[ext_contract(ext_self)]
trait ExtSelf {
    fn resolve_spend(&mut self, amount: U128) -> Vec<U128>;
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Receiver {}

#[near]
impl Receiver {
    #[init]
    pub fn new() -> Self { Self {} }

    #[payable]
    pub fn mt_on_transfer(&mut self, sender_id: AccountId, previous_owner_ids: Vec<AccountId>, token_ids: Vec<String>, amounts: Vec<U128>, msg: String) -> PromiseOrValue<Vec<U128>> {
        let _ = previous_owner_ids;
        match msg.as_str() {
            "spend" => PromiseOrValue::Promise(
                ext_merchant::ext(env::predecessor_account_id())
                    .with_attached_deposit(near_sdk::NearToken::from_yoctonear(1))
                    .mt_transfer(sender_id, token_ids[0].clone(), amounts[0], None, None)
                    .then(ext_self::ext(env::current_account_id()).with_static_gas(near_sdk::Gas::from_tgas(5)).resolve_spend(amounts[0]))
            ),
            "invalid" => PromiseOrValue::Value(vec![U128(0), U128(0)]),
            "fail" => env::panic_str("receiver rejected transfer"),
            "keep" => PromiseOrValue::Value(vec![U128(0)]),
            _ => PromiseOrValue::Value(vec![amounts[0]]),
        }
    }

    #[private]
    pub fn resolve_spend(&mut self, amount: U128) -> Vec<U128> {
        assert_eq!(env::promise_results_count(), 1);
        if matches!(env::promise_result(0), near_sdk::PromiseResult::Failed) { vec![amount] } else { vec![U128(0)] }
    }
}
