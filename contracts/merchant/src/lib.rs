use near_contract_standards::{fungible_token::FungibleToken, fungible_token::core::FungibleTokenCore, fungible_token::metadata::{FungibleTokenMetadata, FungibleTokenMetadataProvider, FT_METADATA_SPEC}, storage_management::{StorageBalance, StorageBalanceBounds, StorageManagement}};
use near_sdk::{assert_one_yocto, env, ext_contract, json_types::U128, near, require, AccountId, NearToken, PanicOnDefault, Promise, PromiseOrValue, PromiseResult};
use near_sdk::collections::{LookupMap, UnorderedMap};
use near_sdk::serde::Serialize;

const MAX_LIMIT: u128 = 1_000_000_000_000_000_000_000_000;
const MT_SPEC: &str = "mt-1.0.0";

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    owner: AccountId, merchant: AccountId, treasury: AccountId, max_trade: u128,
    token: FungibleToken, metadata: FungibleTokenMetadata,
    assets: LookupMap<String, Asset>,
    mt_balances: LookupMap<(AccountId, String), u128>,
    pending_mt_transfers: LookupMap<(AccountId, String), u128>,
    mt_supply: LookupMap<String, u128>,
    mt_metadata: UnorderedMap<String, TokenMetadata>,
    mt_registered: LookupMap<AccountId, u128>,
    storage_balances: UnorderedMap<AccountId, u128>,
    pending_storage_transfers: UnorderedMap<AccountId, u128>,
    storage_usage_baseline: u64,
    native_treasury: u128,
    paid_out: u128,
    reserved_orders: u128,
    seller_claims: UnorderedMap<AccountId, u128>,
    orders: UnorderedMap<String, PurchaseOrder>,
    merchant_inventory: LookupMap<String, u128>,
    demand: LookupMap<String, u128>,
    pending_withdrawals: UnorderedMap<AccountId, u128>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Asset { pub owner_id: AccountId, pub species_id: String, pub title: String }

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct PurchaseOrder { pub token_id: String, pub quantity: u128, pub unit_price: u128, pub expires_at: u64, pub active: bool }

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct TokenMetadata { pub title: Option<String>, pub description: Option<String>, pub media: Option<String>, pub media_hash: Option<String>, pub issued_at: Option<String>, pub expires_at: Option<String>, pub starts_at: Option<String>, pub updated_at: Option<String>, pub extra: Option<String>, pub reference: Option<String>, pub reference_hash: Option<String> }
#[near(serializers = [json])]
#[derive(Clone)]
pub struct MtContractMetadata { pub spec: String, pub name: String }
#[near(serializers = [json])]
#[derive(Clone)]
pub struct MtBaseMetadata { pub name: String, pub id: String, pub symbol: Option<String>, pub icon: Option<String>, pub decimals: Option<String>, pub base_uri: Option<String>, pub reference: Option<String>, pub copies: Option<u64>, pub reference_hash: Option<String> }
#[near(serializers = [json])]
#[derive(Clone)]
pub struct MtMetadataAll { pub base: MtBaseMetadata, pub token: TokenMetadata }

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct MtToken { pub token_id: String, pub owner_id: Option<AccountId>, pub token_metadata: Option<TokenMetadata>, pub base_metadata_id: String }

#[derive(Serialize)]
struct MtEvent<'a, T> { standard: &'static str, version: &'static str, event: &'static str, data: &'a [T] }
#[derive(Serialize)]
struct MintLog<'a> { owner_id: &'a AccountId, token_ids: [&'a str; 1], amounts: [&'static str; 1] }
#[derive(Serialize)]
struct TransferLog<'a> { old_owner_id: &'a AccountId, new_owner_id: &'a AccountId, token_ids: [&'a str; 1], amounts: [String; 1], #[serde(skip_serializing_if = "Option::is_none")] memo: Option<&'a str> }

fn emit<T: Serialize>(event: &'static str, data: &[T]) { env::log_str(&format!("EVENT_JSON:{}", serde_json::to_string(&MtEvent { standard: "nep245", version: "1.0.0", event, data }).unwrap())); }
fn metadata_default(title: String, species: &str) -> TokenMetadata { TokenMetadata { title: Some(title), description: Some(format!("Deep Sea Hunter {species}")), media: None, media_hash: None, issued_at: Some(env::block_timestamp_ms().to_string()), expires_at: None, starts_at: None, updated_at: None, extra: Some(format!("{{\"species_id\":\"{species}\"}}")), reference: None, reference_hash: None } }

#[near]
impl Contract {
    #[init]
    pub fn new(owner_id: AccountId, merchant_id: AccountId, treasury_id: AccountId, max_trade: U128, name: String, symbol: String) -> Self {
        require!(owner_id != merchant_id && owner_id != treasury_id && merchant_id != treasury_id, "Accounts must be distinct");
        require!(max_trade.0 > 0 && max_trade.0 <= MAX_LIMIT, "Invalid trade limit");
        require!(!name.is_empty() && name.len() <= 50 && !symbol.is_empty() && symbol.len() <= 10, "Invalid metadata");
        let metadata = FungibleTokenMetadata { spec: FT_METADATA_SPEC.to_string(), name, symbol, decimals: 0, icon: None, reference: None, reference_hash: None };
        let mut contract = Self { owner: owner_id, merchant: merchant_id, treasury: treasury_id, max_trade: max_trade.0, token: FungibleToken::new(b"ft".to_vec()), metadata, assets: LookupMap::new(b"assets".to_vec()), mt_balances: LookupMap::new(b"mtb".to_vec()), pending_mt_transfers: LookupMap::new(b"mtp".to_vec()), mt_supply: LookupMap::new(b"mts".to_vec()), mt_metadata: UnorderedMap::new(b"mtm".to_vec()), mt_registered: LookupMap::new(b"mtr".to_vec()), storage_balances: UnorderedMap::new(b"stb".to_vec()), pending_storage_transfers: UnorderedMap::new(b"stp".to_vec()), storage_usage_baseline: 0, native_treasury: 0, paid_out: 0, reserved_orders: 0, seller_claims: UnorderedMap::new(b"claims".to_vec()), orders: UnorderedMap::new(b"orders".to_vec()), merchant_inventory: LookupMap::new(b"inventory".to_vec()), demand: LookupMap::new(b"demand".to_vec()), pending_withdrawals: UnorderedMap::new(b"withdraw".to_vec()) };
        let probe: AccountId = "a".repeat(64).parse().unwrap();
        let before = env::storage_usage();
        contract.token.internal_register_account(&probe);
        contract.mt_registered.insert(&probe, &0);
        contract.storage_balances.insert(&probe, &0);
        // Reserve one temporary storage-transfer callback entry in each registration minimum.
        contract.pending_storage_transfers.insert(&probe, &0);
        contract.pending_mt_transfers.insert(&(probe.clone(), "fish:probe".to_string()), &1);
        contract.storage_usage_baseline = env::storage_usage() - before;
        contract.pending_mt_transfers.remove(&(probe.clone(), "fish:probe".to_string()));
        contract.pending_storage_transfers.remove(&probe);
        contract.token.accounts.remove(&probe);
        contract.mt_registered.remove(&probe);
        contract.storage_balances.remove(&probe);
        contract
    }
    pub fn merchant_id(&self) -> AccountId { self.merchant.clone() }
    pub fn treasury_id(&self) -> AccountId { self.treasury.clone() }
    pub fn max_trade(&self) -> U128 { U128(self.max_trade) }
    pub fn treasury_balance(&self) -> U128 { U128(self.token.accounts.get(&self.treasury).unwrap_or(0)) }
    pub fn balance_of(&self, account_id: AccountId) -> U128 { U128(self.token.accounts.get(&account_id).unwrap_or(0)) }
    pub fn asset(&self, asset_id: String) -> Option<Asset> { self.assets.get(&asset_id) }
    pub fn native_treasury(&self) -> U128 { U128(self.native_treasury) }
    pub fn financial_liabilities(&self) -> U128 { U128(self.reserved_orders.checked_add(self.seller_claims.iter().chain(self.pending_withdrawals.iter()).try_fold(0u128, |sum, (_, value)| sum.checked_add(value)).expect("Liability overflow")).expect("Liability overflow")) }
    pub fn reserved_orders(&self) -> U128 { U128(self.reserved_orders) }
    pub fn paid_out(&self) -> U128 { U128(self.paid_out) }
    pub fn actual_balance(&self) -> U128 { U128(env::account_balance().as_yoctonear()) }
    pub fn storage_reserve(&self) -> U128 { U128(self.storage_balances.iter().try_fold(0u128, |sum, (_, amount)| sum.checked_add(amount)).expect("Storage reserve overflow")) }
    pub fn treasury_available(&self) -> U128 { U128(self.native_treasury.saturating_sub(self.financial_liabilities().0)) }
    pub fn accounting_invariant(&self) -> bool {
        // Pending transfers may already have left the account before their callback.
        // Conservatively require coverage even during that interval.
        let stake=u128::from(env::storage_usage()).checked_mul(env::storage_byte_cost().as_yoctonear()).expect("Storage overflow");
        let refundable=self.storage_balances.iter().try_fold(0u128, |sum,(id,total)| sum.checked_add(total.checked_sub(self.mt_registered.get(&id).unwrap_or(0)).expect("Storage accounting underflow"))).expect("Storage overflow");
        self.native_treasury >= self.financial_liabilities().0 &&
        stake.checked_add(refundable).and_then(|v| v.checked_add(self.native_treasury)).map_or(false, |required|env::account_balance().as_yoctonear()>=required)
    }
    pub fn seller_claim(&self, account_id: AccountId) -> U128 { U128(self.seller_claims.get(&account_id).unwrap_or(0)) }
    pub fn purchase_order(&self, order_id: String) -> Option<PurchaseOrder> { self.orders.get(&order_id) }
    pub fn merchant_inventory(&self, token_id: String) -> U128 { U128(self.merchant_inventory.get(&token_id).unwrap_or(0)) }

    #[payable]
    pub fn create_purchase_order(&mut self, order_id: String, token_id: String, quantity: U128, unit_price: U128, expires_at: u64) {
        require!(env::predecessor_account_id() == self.owner, "Owner only");
        require!(!order_id.is_empty() && order_id.len() <= 64 && self.orders.get(&order_id).is_none(), "Invalid or duplicate order");
        require!(self.mt_supply.get(&token_id).is_some(), "Token not found");
        require!(quantity.0 > 0 && unit_price.0 > 0, "Invalid order amount");
        require!(unit_price.0 <= self.max_trade, "Trade limit exceeded");
        require!(expires_at > env::block_timestamp_ms(), "Order already expired");
        assert_one_yocto();
        let reserve = quantity.0.checked_mul(unit_price.0).expect("Order reserve overflow");
        let claims = self.seller_claims.iter().chain(self.pending_withdrawals.iter()).try_fold(0u128, |sum, (_, value)| sum.checked_add(value)).expect("Liability overflow");
        let committed = self.reserved_orders.checked_add(claims).expect("Liability overflow");
        require!(self.native_treasury.checked_sub(committed).unwrap_or(0) >= reserve, "Insufficient treasury funds");
        self.reserved_orders = self.reserved_orders.checked_add(reserve).expect("Reserve overflow");
        let storage_before=env::storage_usage();
        self.orders.insert(&order_id, &PurchaseOrder { token_id, quantity: quantity.0, unit_price: unit_price.0, expires_at, active: true });
        self.charge_storage_delta(&self.owner.clone(), storage_before);
    }

    #[payable]
    pub fn accept_purchase_order(&mut self, order_id: String, amount: U128) {
        assert_one_yocto();
        let seller = env::predecessor_account_id();
        let mut order = self.orders.get(&order_id).expect("Order not found");
        require!(order.active && env::block_timestamp_ms() < order.expires_at, "Order inactive or expired");
        require!(amount.0 > 0 && amount.0 <= order.quantity, "Invalid order quantity");
        require!(self.mt_registered.get(&self.merchant).is_some(), "Merchant not registered");
        let payment = amount.0.checked_mul(order.unit_price).expect("Payment overflow");
        require!(self.reserved_orders >= payment, "Order reserve insufficient");
        self.mt_transfer_internal(&seller, &self.merchant.clone(), &order.token_id, amount.0, Some("Merchant order settlement"));
        order.quantity -= amount.0;
        if order.quantity == 0 { order.active = false; }
        let order_storage_before=env::storage_usage();
        self.orders.insert(&order_id, &order);
        self.charge_storage_delta(&self.owner.clone(), order_storage_before);
        self.reserved_orders -= payment;
        let merchant_storage_before=env::storage_usage();
        self.merchant_inventory.insert(&order.token_id, &self.merchant_inventory.get(&order.token_id).unwrap_or(0).checked_add(amount.0).expect("Inventory overflow"));
        self.demand.insert(&order.token_id, &self.demand.get(&order.token_id).unwrap_or(0).saturating_sub(amount.0));
        self.charge_storage_delta(&self.merchant.clone(), merchant_storage_before);
        let claim = self.seller_claims.get(&seller).unwrap_or(0).checked_add(payment).expect("Claim overflow");
        let claim_storage_before=env::storage_usage();
        self.seller_claims.insert(&seller, &claim);
        self.charge_storage_delta(&seller, claim_storage_before);
    }

    #[payable]
    pub fn withdraw_proceeds(&mut self) -> Promise {
        assert_one_yocto();
        let seller = env::predecessor_account_id();
        let amount = self.seller_claims.get(&seller).unwrap_or(0);
        require!(amount > 0, "No proceeds");
        require!(self.pending_withdrawals.get(&seller).is_none(), "Withdrawal pending");
        let storage_before=env::storage_usage();
        self.seller_claims.insert(&seller, &0);
        self.pending_withdrawals.insert(&seller, &amount);
        self.charge_storage_delta(&seller, storage_before);
        Promise::new(seller.clone()).transfer(NearToken::from_yoctonear(amount))
            .then(ext_self::ext(env::current_account_id()).with_static_gas(near_sdk::Gas::from_tgas(5)).resolve_withdrawal(seller, U128(amount)))
    }

    #[private]
    pub fn resolve_withdrawal(&mut self, seller: AccountId, amount: U128) -> bool {
        require!(self.pending_withdrawals.get(&seller) == Some(amount.0), "Withdrawal mismatch");
        require!(env::promise_results_count() == 1, "Expected one promise result");
        let storage_before=env::storage_usage();
        self.pending_withdrawals.remove(&seller);
        let success = if matches!(env::promise_result(0), PromiseResult::Failed) {
            self.seller_claims.insert(&seller, &self.seller_claims.get(&seller).unwrap_or(0).checked_add(amount.0).expect("Claim overflow"));
            false
        } else {
            self.native_treasury = self.native_treasury.checked_sub(amount.0).expect("Treasury accounting underflow");
            self.paid_out = self.paid_out.checked_add(amount.0).expect("Paid-out overflow");
            true
        };
        self.charge_storage_delta(&seller, storage_before);
        success
    }

    #[payable]
    pub fn register(&mut self) { require!(self.storage_balances.get(&env::predecessor_account_id()).is_none(), "Already registered"); self.storage_deposit(None, Some(true)); }
    #[payable]
    pub fn fund_treasury(&mut self) { require!(env::predecessor_account_id() == self.owner, "Owner only"); let amount=env::attached_deposit().as_yoctonear(); require!(amount>0,"Funding required"); self.native_treasury=self.native_treasury.checked_add(amount).expect("Treasury overflow"); }
    #[payable]
    pub fn mint_asset(&mut self, asset_id: String, player_id: AccountId, species_id: String, title: String) {
        assert_one_yocto(); require!(env::predecessor_account_id() == self.owner, "Owner only");
        require!(valid_asset_id(&asset_id), "Invalid asset ID"); require!(valid_species(&species_id), "Invalid species"); require!(!title.is_empty() && title.len() <= 80, "Invalid title");
        require!(player_id != self.merchant && player_id != self.treasury, "Invalid player account");
        require!(self.token.accounts.get(&player_id).is_some(), "Player not registered");
        let owner = self.owner.clone();
        let token_id = format!("fish:{asset_id}");
        let metadata = metadata_default(title.clone(), &species_id);
        require!(valid_mt_id(&token_id), "Invalid token ID");
        require!(self.mt_supply.get(&token_id).is_none(), "Token already minted");
        let before_metadata = env::storage_usage();
        self.mt_metadata.insert(&token_id, &metadata);
        self.charge_storage_delta(&owner, before_metadata);
        let before_supply = env::storage_usage();
        self.mt_supply.insert(&token_id, &1);
        self.charge_storage_delta(&owner, before_supply);
        let before_balance = env::storage_usage();
        self.mt_balances.insert(&(player_id.clone(), token_id.clone()), &1);
        self.charge_storage_delta(&player_id, before_balance);
        let before_asset = env::storage_usage();
        self.assets.insert(&format!("legacy:{}", title), &Asset { owner_id: player_id.clone(), species_id, title });
        self.charge_storage_delta(&owner, before_asset);
        emit("mt_mint", &[MintLog { owner_id: &player_id, token_ids: [&token_id], amounts: ["1"] }]);
    }
    #[payable]
    pub fn transfer_asset(&mut self, asset_id: String, receiver_id: AccountId) { self.mt_transfer(receiver_id, format!("fish:{asset_id}"), U128(1), None, None); }
    #[payable]
    pub fn set_max_trade(&mut self, max_trade: U128) { assert_one_yocto(); require!(env::predecessor_account_id() == self.owner, "Owner only"); require!(max_trade.0 > 0 && max_trade.0 <= MAX_LIMIT, "Invalid trade limit"); self.max_trade = max_trade.0; }

    pub fn mt_metadata_contract(&self) -> MtContractMetadata { MtContractMetadata { spec: MT_SPEC.into(), name: self.metadata.name.clone() } }
    pub fn mt_metadata_token_all(&self, token_ids: Vec<String>) -> Vec<Option<MtMetadataAll>> { token_ids.iter().map(|id| self.mt_metadata.get(id).map(|token| MtMetadataAll { base: self.base_metadata(id), token })).collect() }
    pub fn mt_metadata_token_by_token_id(&self, token_ids: Vec<String>) -> Vec<Option<TokenMetadata>> { token_ids.iter().map(|id| self.mt_metadata.get(id)).collect() }
    pub fn mt_metadata_base_by_token_id(&self, token_ids: Vec<String>) -> Vec<Option<MtBaseMetadata>> { token_ids.iter().map(|id| self.mt_metadata.get(id).map(|_| self.base_metadata(id))).collect() }
    pub fn mt_metadata_base_by_metadata_id(&self, ids: Vec<String>) -> Vec<Option<MtBaseMetadata>> { ids.iter().map(|id| self.base_metadata_id(id)).collect() }
    pub fn mt_token(&self, token_ids: Vec<String>) -> Vec<Option<MtToken>> { token_ids.iter().map(|id| self.mt_supply.get(id).map(|_| MtToken { token_id: id.clone(), owner_id: None, token_metadata: self.mt_metadata.get(id), base_metadata_id: base_id(id) })).collect() }
    pub fn mt_balance_of(&self, account_id: AccountId, token_id: String) -> U128 { U128(self.mt_balances.get(&(account_id, token_id)).unwrap_or(0)) }
    pub fn mt_batch_balance_of(&self, account_id: AccountId, token_ids: Vec<String>) -> Vec<U128> { token_ids.into_iter().map(|id| self.mt_balance_of(account_id.clone(), id)).collect() }
    pub fn mt_supply(&self, token_id: String) -> Option<U128> { self.mt_supply.get(&token_id).map(U128) }
    pub fn mt_batch_supply(&self, token_ids: Vec<String>) -> Vec<Option<U128>> { token_ids.into_iter().map(|id| self.mt_supply(id)).collect() }
    pub fn mt_tokens_for_owner(&self, account_id: AccountId, from_index: Option<U128>, limit: Option<u64>) -> Vec<MtToken> { let skip=usize::try_from(from_index.unwrap_or(U128(0)).0).unwrap_or(usize::MAX); self.mt_metadata.keys().filter_map(|id| { let n=self.mt_balance_of(account_id.clone(), id.clone()).0; (n>0).then(|| MtToken { token_id:id.clone(), owner_id:Some(account_id.clone()), token_metadata:self.mt_metadata.get(&id), base_metadata_id:base_id(&id) }) }).skip(skip).take(limit.unwrap_or(u64::MAX) as usize).collect() }
    pub fn mt_tokens(&self, from_index: Option<U128>, limit: Option<u64>) -> Vec<MtToken> { let skip=usize::try_from(from_index.unwrap_or(U128(0)).0).unwrap_or(usize::MAX); self.mt_metadata.keys().map(|id| MtToken { token_id:id.clone(), owner_id:None, token_metadata:self.mt_metadata.get(&id), base_metadata_id:base_id(&id) }).skip(skip).take(limit.unwrap_or(u64::MAX) as usize).collect() }
    pub fn mt_tokens_base_metadata_all(&self, from_index: Option<U128>, limit: Option<u64>) -> Vec<MtBaseMetadata> { let ids: Vec<String>=self.mt_metadata.keys().map(|id|base_id(&id)).collect(); let unique:std::collections::BTreeSet<_>=ids.into_iter().collect(); unique.into_iter().skip(usize::try_from(from_index.unwrap_or(U128(0)).0).unwrap_or(usize::MAX)).take(limit.unwrap_or(u64::MAX) as usize).filter_map(|id|self.base_metadata_id(&id)).collect() }

    #[payable]
    pub fn mt_transfer(&mut self, receiver_id: AccountId, token_id: String, amount: U128, approval: Option<(AccountId,u64)>, memo: Option<String>) { assert_one_yocto(); require!(approval.is_none(), "Approvals unsupported"); let sender=env::predecessor_account_id(); self.mt_transfer_internal(&sender,&receiver_id,&token_id,amount.0,memo.as_deref()); }
    #[payable]
    pub fn mt_batch_transfer(&mut self, receiver_id: AccountId, token_ids: Vec<String>, amounts: Vec<U128>, approvals: Option<Vec<Option<(AccountId,u64)>>>, memo: Option<String>) { assert_one_yocto(); validate_batch(&token_ids,&amounts,approvals.as_ref().map(Vec::len)); require!(approvals.as_ref().map_or(true, |items| items.iter().all(Option::is_none)), "Approvals unsupported"); for (id,amount) in token_ids.iter().zip(amounts.iter()) { self.mt_transfer_internal(&env::predecessor_account_id(),&receiver_id,id,amount.0,memo.as_deref()); } }
    #[payable]
    pub fn mt_transfer_call(&mut self, receiver_id: AccountId, token_id: String, amount: U128, approval: Option<(AccountId,u64)>, memo: Option<String>, msg: String) -> Promise { require!(approval.is_none(), "Approvals unsupported"); self.mt_batch_transfer_call(receiver_id, vec![token_id], vec![amount], None, memo, msg) }
    #[payable]
    pub fn mt_batch_transfer_call(&mut self, receiver_id: AccountId, token_ids: Vec<String>, amounts: Vec<U128>, approvals: Option<Vec<Option<(AccountId,u64)>>>, memo: Option<String>, msg: String) -> Promise { assert_one_yocto(); validate_batch(&token_ids,&amounts,approvals.as_ref().map(Vec::len)); require!(approvals.as_ref().map_or(true, |items| items.iter().all(Option::is_none)), "Approvals unsupported"); let sender=env::predecessor_account_id(); for (id,amount) in token_ids.iter().zip(&amounts) { self.mt_transfer_internal(&sender,&receiver_id,id,amount.0,memo.as_deref()); self.adjust_pending_mt(&receiver_id,id,amount.0,true); } ext_mt_receiver::ext(receiver_id.clone()).with_static_gas(near_sdk::Gas::from_tgas(10)).mt_on_transfer(sender.clone(),vec![sender.clone();token_ids.len()],token_ids.clone(),amounts.clone(),msg).then(ext_self::ext(env::current_account_id()).with_static_gas(near_sdk::Gas::from_tgas(10)).mt_resolve_transfer(sender,receiver_id,token_ids,amounts,None)) }
    #[private]
    pub fn mt_resolve_transfer(&mut self, sender_id: AccountId, receiver_id: AccountId, token_ids: Vec<String>, amounts: Vec<U128>, _approvals: Option<Vec<Option<Vec<(AccountId,u64,U128)>>>>) -> Vec<U128> { require!(token_ids.len()==amounts.len(),"Mismatched token_ids and amounts"); require!(env::promise_results_count()==1,"Expected one promise result"); let unused=match env::promise_result(0) { PromiseResult::Successful(bytes)=>match serde_json::from_slice::<Vec<U128>>(&bytes) { Ok(values) if values.len()==amounts.len()=>values, _=>amounts.clone() }, _=>amounts.clone() }; let mut used=Vec::new(); for (i,(id,amount)) in token_ids.iter().zip(&amounts).enumerate() { let requested=amount.0; let unused=unused[i].0.min(requested); self.adjust_pending_mt(&receiver_id,id,requested,false); if unused>0 { self.mt_transfer_internal(&receiver_id,&sender_id,id,unused,None); } used.push(U128(requested-unused)); } used }

    fn adjust_pending_mt(&mut self, account:&AccountId, id:&str, amount:u128, add:bool) { let key=(account.clone(),id.to_string()); let before=env::storage_usage(); let current=self.pending_mt_transfers.get(&key).unwrap_or(0); let next=if add { current.checked_add(amount).expect("Pending transfer overflow") } else { current.checked_sub(amount).expect("Pending transfer underflow") }; if next==0 { self.pending_mt_transfers.remove(&key); } else { self.pending_mt_transfers.insert(&key,&next); } self.charge_storage_delta(account,before); }
    fn base_metadata(&self,id:&str)->MtBaseMetadata { let b=base_id(id); MtBaseMetadata{name:b.clone(),id:b,symbol:None,icon:None,decimals:None,base_uri:None,reference:None,copies:None,reference_hash:None} }
    fn base_metadata_id(&self,id:&str)->Option<MtBaseMetadata> { self.mt_metadata.keys().any(|key|base_id(&key)==id).then(||MtBaseMetadata{name:id.into(),id:id.into(),symbol:None,icon:None,decimals:None,base_uri:None,reference:None,copies:None,reference_hash:None}) }
    fn mt_transfer_internal(&mut self, sender:&AccountId, receiver:&AccountId,id:&str,amount:u128,memo:Option<&str>) { require!(sender!=receiver,"Self transfer"); require!(self.mt_registered.get(receiver).is_some(),"Token receiver not registered"); require!(self.mt_supply.get(&id.to_string()).is_some(),"Token not found"); let sender_key=(sender.clone(),id.to_string()); let bal=self.mt_balances.get(&sender_key).unwrap_or(0); let reserved=self.pending_mt_transfers.get(&sender_key).unwrap_or(0); require!(amount>0 && bal.saturating_sub(reserved)>=amount,"Insufficient token balance");
        // Sender owns its balance entry: removing an emptied entry refunds the sender's charged storage.
        let sender_before=env::storage_usage(); if bal==amount { self.mt_balances.remove(&sender_key); } else { self.mt_balances.insert(&sender_key,&(bal-amount)); } self.charge_storage_delta(sender,sender_before);
        // Receiver owns its balance entry and pays for creating it.
        let receiver_key=(receiver.clone(),id.to_string()); let n=self.mt_balances.get(&receiver_key).unwrap_or(0); let receiver_before=env::storage_usage(); self.mt_balances.insert(&receiver_key,&n.checked_add(amount).expect("Balance overflow")); self.charge_storage_delta(receiver,receiver_before);
        emit("mt_transfer",&[TransferLog{old_owner_id:sender,new_owner_id:receiver,token_ids:[id],amounts:[amount.to_string()],memo}]); }
}

#[near]
impl FungibleTokenCore for Contract {
 #[payable] fn ft_transfer(&mut self,receiver_id:AccountId,amount:U128,memo:Option<String>){assert_one_yocto();require!(env::predecessor_account_id()!=self.treasury,"Treasury transfers only through merchant purchase");require!(self.token.accounts.get(&receiver_id).is_some(),"Receiver not registered");require!(receiver_id!=self.treasury,"Treasury credits only through purchase");self.token.internal_transfer(&env::predecessor_account_id(),&receiver_id,amount.0,memo);}
 #[payable] fn ft_transfer_call(&mut self,_receiver_id:AccountId,_amount:U128,_memo:Option<String>,_msg:String)->PromiseOrValue<U128>{env::panic_str("ft_transfer_call unsupported")}
 fn ft_total_supply(&self)->U128{U128(self.token.total_supply)} fn ft_balance_of(&self,id:AccountId)->U128{U128(self.token.accounts.get(&id).unwrap_or(0))}
}
#[near] impl FungibleTokenMetadataProvider for Contract { fn ft_metadata(&self)->FungibleTokenMetadata{self.metadata.clone()} }
#[near]
impl StorageManagement for Contract {
 #[payable] fn storage_deposit(&mut self,account_id:Option<AccountId>,registration_only:Option<bool>)->StorageBalance {let payer=env::predecessor_account_id();let id=account_id.unwrap_or_else(||payer.clone());require!(self.pending_storage_transfers.get(&id).is_none(),"Storage transfer pending");let deposit=env::attached_deposit().as_yoctonear();require!(deposit>0,"Deposit must be positive");require!(registration_only!=Some(true) || id==payer,"registration_only requires payer account");let min=self.storage_minimum();let old=self.storage_balances.get(&id).unwrap_or(0);if old==0 {require!(deposit>=min,"Insufficient storage deposit");self.token.internal_register_account(&id);self.mt_registered.insert(&id,&0);if registration_only==Some(true){self.storage_balances.insert(&id,&min);if deposit>min{let refund=deposit-min;self.pending_storage_transfers.insert(&id,&refund);Promise::new(payer).transfer(NearToken::from_yoctonear(refund)).then(ext_self::ext(env::current_account_id()).with_static_gas(near_sdk::Gas::from_tgas(5)).resolve_storage_transfer(id.clone(),U128(refund),false,true));}}else{self.storage_balances.insert(&id,&deposit);}}else if registration_only==Some(true){self.pending_storage_transfers.insert(&id,&deposit);Promise::new(payer).transfer(NearToken::from_yoctonear(deposit)).then(ext_self::ext(env::current_account_id()).with_static_gas(near_sdk::Gas::from_tgas(5)).resolve_storage_transfer(id.clone(),U128(deposit),false,true));}else{self.storage_balances.insert(&id,&old.checked_add(deposit).expect("Storage balance overflow"));}self.storage_balance_of(id).unwrap()}
 #[payable] fn storage_withdraw(&mut self,amount:Option<NearToken>)->StorageBalance {assert_one_yocto();let id=env::predecessor_account_id();require!(self.pending_storage_transfers.get(&id).is_none(),"Storage transfer pending");let total=self.storage_balances.get(&id).expect("Account not registered");let available=self.storage_available(&id);let withdraw=amount.map(|v|v.as_yoctonear()).unwrap_or(available);require!(withdraw<=available,"Withdraw exceeds available storage balance");if withdraw>0{self.storage_balances.insert(&id,&(total-withdraw));self.pending_storage_transfers.insert(&id,&withdraw);Promise::new(id.clone()).transfer(NearToken::from_yoctonear(withdraw)).then(ext_self::ext(env::current_account_id()).with_static_gas(near_sdk::Gas::from_tgas(5)).resolve_storage_transfer(id.clone(),U128(withdraw),false,true));}StorageBalance{total:NearToken::from_yoctonear(total-withdraw),available:NearToken::from_yoctonear(available-withdraw)}}
 #[payable] fn storage_unregister(&mut self,_force:Option<bool>)->bool {assert_one_yocto();let id=env::predecessor_account_id();let Some(total)=self.storage_balances.get(&id) else{return false};require!(self.pending_storage_transfers.get(&id).is_none(),"Storage transfer pending");require!(self.mt_metadata.keys().all(|token|self.pending_mt_transfers.get(&(id.clone(),token)).unwrap_or(0)==0),"Token transfer callback pending");require!(self.mt_registered.get(&id).unwrap_or(0)==0,"Account has storage-backed data");require!(self.mt_metadata.keys().all(|token|self.mt_balance_of(id.clone(),token).0==0),"Account has token balances");require!(self.token.accounts.get(&id).unwrap_or(0)==0,"Account has fungible balance");require!(self.seller_claims.get(&id).unwrap_or(0)==0 && self.pending_withdrawals.get(&id).is_none(),"Account has proceeds");require!(self.orders.values().all(|order| !order.active || id != self.owner),"Account has open orders");self.pending_storage_transfers.insert(&id,&total);Promise::new(id.clone()).transfer(NearToken::from_yoctonear(total)).then(ext_self::ext(env::current_account_id()).with_static_gas(near_sdk::Gas::from_tgas(5)).resolve_storage_transfer(id,U128(total),true,false));true}
 fn storage_balance_bounds(&self)->StorageBalanceBounds{let min=self.storage_minimum();StorageBalanceBounds{min:NearToken::from_yoctonear(min),max:None}}
 fn storage_balance_of(&self,account_id:AccountId)->Option<StorageBalance>{self.storage_balances.get(&account_id).map(|total|StorageBalance{total:NearToken::from_yoctonear(total),available:NearToken::from_yoctonear(self.storage_available(&account_id))})}
}
#[near]
impl Contract {
 // Registration minimum = probe-measured baseline bytes (measured in new()).
 // It covers one pending callback entry; every per-token balance/metadata
 // write beyond that is charged to its owner by charge_storage_delta, and a
 // write the owner cannot cover panics with "Insufficient storage balance"
 // instead of minting an unfunded entry. Fund accounts above the minimum
 // before minting or receiving (see contracts/merchant/README.md).
 fn storage_minimum(&self)->u128 { u128::from(self.storage_usage_baseline).checked_mul(env::storage_byte_cost().as_yoctonear()).expect("Storage minimum overflow") }
 // Deposit beyond the registration minimum and storage already charged to the account.
 fn storage_available(&self, id:&AccountId)->u128 { self.storage_balances.get(id).unwrap_or(0).saturating_sub(self.storage_minimum()).saturating_sub(self.mt_registered.get(id).unwrap_or(0)) }
 #[private]
 pub fn resolve_storage_transfer(&mut self, account:AccountId, amount:U128, unregister:bool, restore_credit:bool)->bool { require!(env::promise_results_count()==1,"Expected one promise result"); require!(self.pending_storage_transfers.get(&account)==Some(amount.0),"Storage transfer mismatch"); self.pending_storage_transfers.remove(&account); if matches!(env::promise_result(0),PromiseResult::Failed) { if restore_credit { let total=self.storage_balances.get(&account).expect("Account not registered"); self.storage_balances.insert(&account,&total.checked_add(amount.0).expect("Storage balance overflow")); } false } else { if unregister { self.storage_balances.remove(&account); self.mt_registered.remove(&account); self.token.accounts.remove(&account); } true } }
 fn charge_storage_delta(&mut self, account:&AccountId, before:u64) {
     let after=env::storage_usage();
     env::log_str(&format!("STORAGE_CHARGE {{\"account\":\"{account}\",\"before\":{before},\"after\":{after},\"byte_cost\":{}}}", env::storage_byte_cost().as_yoctonear()));
     let cost=u128::from(after.abs_diff(before)).checked_mul(env::storage_byte_cost().as_yoctonear()).expect("Storage charge overflow");
     let used=self.mt_registered.get(account).expect("Storage account not registered");
     let next=if after>=before {used.checked_add(cost)} else {used.checked_sub(cost)}.expect("Storage accounting overflow");
     let required=self.storage_minimum().checked_add(next).expect("Storage accounting overflow");
     let total=self.storage_balances.get(account).unwrap_or(0);
     if total<required { env::panic_str(&format!("Insufficient storage balance: {account} requires {required}, has {total}")); }
     self.mt_registered.insert(account,&next);
 }
}

#[ext_contract(ext_mt_receiver)]
pub trait MtReceiver { fn mt_on_transfer(&mut self,sender_id:AccountId,previous_owner_ids:Vec<AccountId>,token_ids:Vec<String>,amounts:Vec<U128>,msg:String)->PromiseOrValue<Vec<U128>>; }
#[ext_contract(ext_self)]
pub trait ExtSelf { fn mt_resolve_transfer(&mut self,sender_id:AccountId,receiver_id:AccountId,token_ids:Vec<String>,amounts:Vec<U128>,approvals:Option<Vec<Option<Vec<(AccountId,u64,U128)>>>>)->Vec<U128>; fn resolve_withdrawal(&mut self,seller:AccountId,amount:U128)->bool; fn resolve_storage_transfer(&mut self,account:AccountId,amount:U128,unregister:bool,restore_credit:bool)->bool; }
fn validate_batch(ids: &[String], amounts: &[U128], approvals: Option<usize>) {
 require!(ids.len()==amounts.len(), "Mismatched token_ids and amounts");
 require!(approvals.map_or(true, |n| n==ids.len()), "Mismatched approvals");
 // ponytail: bounded MVP batches; increase only after measuring callback gas.
 require!(!ids.is_empty() && ids.len()<=10, "Batch must contain 1 to 10 tokens");
 require!(ids.iter().collect::<std::collections::BTreeSet<_>>().len()==ids.len(), "Duplicate token IDs");
}
fn valid_asset_id(s:&str)->bool{s.len()>=8&&s.len()<=64&&s.bytes().all(|b|b.is_ascii_alphanumeric()||b==b'-'||b==b'_')}
fn valid_species(s:&str)->bool{!s.is_empty()&&s.len()<=40&&s.bytes().all(|b|b.is_ascii_lowercase()||b.is_ascii_digit()||b==b'-'||b==b'_')}
fn valid_mt_id(s:&str)->bool{let mut p=s.splitn(2,':');let kind=p.next().unwrap_or("");let item=p.next().unwrap_or("");!kind.is_empty()&&kind.len()<=24&&kind.bytes().all(|b|b.is_ascii_lowercase()||b.is_ascii_digit()||b==b'-'||b==b'_')&&!item.is_empty()&&item.len()<=64&&item.bytes().all(|b|b.is_ascii_alphanumeric()||b==b'-'||b==b'_')}
fn base_id(s:&str)->String{s.split(':').next().unwrap_or(s).to_string()}
#[cfg(test)] mod tests;
