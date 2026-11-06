use near_contract_standards::non_fungible_token::{NonFungibleToken, Token, TokenId};
use near_contract_standards::non_fungible_token::core::{NonFungibleTokenCore, NonFungibleTokenResolver};
use near_contract_standards::non_fungible_token::metadata::{NFTContractMetadata, NonFungibleTokenMetadataProvider, TokenMetadata};
use near_sdk::collections::LookupMap;
use near_sdk::json_types::{U128, U64};
use near_sdk::{near, env, require, assert_one_yocto, AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseOrValue, PromiseResult};
use std::collections::HashMap;

const ACCOUNT_STORAGE: u128 = 10_000_000_000_000_000_000_000; // 0.01 NEAR, refundable at unregister
const LISTING_STORAGE: u128 = 10_000_000_000_000_000_000_000; // 0.01 NEAR, refunded to pull balance

#[near(serializers=[borsh, json])]
#[derive(Clone)]
pub struct Listing { pub seller: AccountId, pub price: U128, pub expires_at: U64 }
#[near(serializers=[borsh])]
#[derive(Clone)]
pub struct Balance { available: u128, withdrawing: u128 }

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    nft: NonFungibleToken,
    owner: AccountId,
    fee_bps: u16,
    listings: LookupMap<TokenId, Listing>,
    balances: LookupMap<AccountId, Balance>,
    in_flight: LookupMap<TokenId, bool>,
    listing_counts: LookupMap<AccountId, u32>,
    paused: bool,
}

fn event(name: &str, data: near_sdk::serde_json::Value) {
    env::log_str(&format!("EVENT_JSON:{}", near_sdk::serde_json::json!({"standard":"deepfish","version":"1.0.0","event":name,"data":[data]})));
}

#[near]
impl Contract {
    #[init]
    pub fn new(owner_id: AccountId, fee_bps: u16) -> Self {
        require!(fee_bps <= 500, "Fee cap 5%");
        require!(owner_id != env::current_account_id(), "Use external owner");
        Self { nft: NonFungibleToken::new(b"n".to_vec(), owner_id.clone(), Some(b"m".to_vec()), Some(b"e".to_vec()), None::<Vec<u8>>), owner:owner_id, fee_bps, listings:LookupMap::new(b"l"), balances:LookupMap::new(b"b"), in_flight:LookupMap::new(b"f"), listing_counts:LookupMap::new(b"c"), paused:false }
    }
    #[payable]
    pub fn register(&mut self) {
        let who=env::predecessor_account_id();
        require!(self.balances.get(&who).is_none(), "Already registered");
        require!(env::attached_deposit().as_yoctonear()==ACCOUNT_STORAGE, "Exact 0.01 NEAR storage deposit required");
        let before=env::storage_usage();
        self.balances.insert(&who,&Balance{available:0,withdrawing:0});
        self.listing_counts.insert(&who,&0);
        require!((env::storage_usage()-before) as u128 * env::storage_byte_cost().as_yoctonear() <= ACCOUNT_STORAGE, "Storage budget exceeded");
    }
    #[payable]
    pub fn unregister(&mut self) -> Promise {
        assert_one_yocto();
        let who=env::predecessor_account_id();let b=self.balance(&who);
        require!(b.available==0 && b.withdrawing==0 && self.listing_counts.get(&who).unwrap_or(0)==0, "Account still in use");
        // Keep registration until refund callback succeeds; failed refund restores availability.
        self.balances.insert(&who,&Balance{available:0,withdrawing:ACCOUNT_STORAGE});
        Promise::new(who.clone()).transfer(NearToken::from_yoctonear(ACCOUNT_STORAGE)).then(
            Self::ext(env::current_account_id()).with_static_gas(Gas::from_tgas(10)).resolve_withdraw(who,U128(ACCOUNT_STORAGE),true))
    }
    pub fn balance_of(&self, account_id: AccountId) -> U128 { U128(self.balances.get(&account_id).map(|b|b.available).unwrap_or(0)) }
    #[payable]
    pub fn withdraw(&mut self) -> Promise {
        assert_one_yocto();let who=env::predecessor_account_id();let mut b=self.balance(&who);
        require!(b.withdrawing==0 && b.available>0, "No available withdrawal");
        let amount=b.available;b.available=0;b.withdrawing=amount;self.balances.insert(&who,&b);
        Promise::new(who.clone()).transfer(NearToken::from_yoctonear(amount)).then(
            Self::ext(env::current_account_id()).with_static_gas(Gas::from_tgas(10)).resolve_withdraw(who,U128(amount),false))
    }
    #[private]
    pub fn resolve_withdraw(&mut self, account_id: AccountId, amount: U128, unregister: bool) -> bool {
        require!(env::promise_results_count()==1, "Expected payout result");
        let mut b=self.balance(&account_id);require!(b.withdrawing==amount.0, "Withdrawal mismatch");
        let success=matches!(env::promise_result(0),PromiseResult::Successful(_));
        b.withdrawing=0;
        if success && unregister { self.balances.remove(&account_id);self.listing_counts.remove(&account_id); }
        else { if !success && !unregister {b.available=b.available.checked_add(amount.0).unwrap();}self.balances.insert(&account_id,&b); }
        event("withdrawal",near_sdk::serde_json::json!({"account_id":account_id,"amount":amount,"success":success,"unregister":unregister}));success
    }
    #[payable]
    pub fn nft_mint(&mut self, token_id: TokenId, receiver_id: AccountId, title: String, description: String) -> Token {
        require!(env::predecessor_account_id()==self.owner, "Owner only");
        require!(token_id.starts_with("collectible-") && token_id.len()<=64, "Collectible IDs only");
        require!(title.len()<=80 && description.len()<=512, "Metadata too long");
        require!(receiver_id!=env::current_account_id(), "Cannot mint into escrow");
        let metadata=TokenMetadata { title:Some(title),description:Some(description),extra:Some("Collectible ownership only; not verified catch provenance.".into()),..Default::default() };
        self.nft.internal_mint(token_id,receiver_id,Some(metadata))
    }
    #[payable]
    pub fn list(&mut self, token_id: TokenId, price: U128, expires_at: U64) {
        require!(!self.paused, "Marketplace paused");
        require!(env::attached_deposit().as_yoctonear()==LISTING_STORAGE, "Exact 0.01 NEAR listing deposit required");
        require!(price.0>0 && price.0<=1000*10u128.pow(24), "Invalid price");
        require!(expires_at.0>env::block_timestamp() && expires_at.0-env::block_timestamp()<=30*86400*1_000_000_000, "Invalid expiry");
        require!(self.listings.get(&token_id).is_none() && self.in_flight.get(&token_id).is_none(), "Token busy");
        let seller=env::predecessor_account_id();self.idle(&seller);self.idle(&self.owner);
        require!(self.nft.owner_by_id.get(&token_id)==Some(seller.clone()), "Seller must own token");
        let before=env::storage_usage();
        self.nft.internal_transfer(&seller,&env::current_account_id(),&token_id,None,Some("Escrow listing".into()));
        self.listings.insert(&token_id,&Listing{seller:seller.clone(),price,expires_at});
        self.listing_counts.insert(&seller,&(self.listing_counts.get(&seller).unwrap()+1));
        require!(env::storage_usage().saturating_sub(before) as u128*env::storage_byte_cost().as_yoctonear()<=LISTING_STORAGE, "Storage budget exceeded");
        event("listed",near_sdk::serde_json::json!({"token_id":token_id,"seller":seller,"price":price,"expires_at":expires_at}));
    }
    pub fn listing(&self, token_id: TokenId) -> Option<Listing> { self.listings.get(&token_id) }
    #[payable]
    pub fn delist(&mut self, token_id: TokenId) {
        assert_one_yocto();let l=self.listings.get(&token_id).expect("Not listed");
        require!(env::predecessor_account_id()==l.seller || env::block_timestamp()>=l.expires_at.0, "Seller only until expiry");
        self.idle(&l.seller);
        self.nft.internal_transfer(&env::current_account_id(),&l.seller,&token_id,None,Some("Delisted".into()));
        self.remove_listing(&token_id,&l.seller);self.credit(&l.seller,LISTING_STORAGE);
        event("delisted",near_sdk::serde_json::json!({"token_id":token_id,"seller":l.seller}));
    }
    #[payable]
    pub fn buy(&mut self, token_id: TokenId) {
        require!(!self.paused, "Marketplace paused");
        let l=self.listings.get(&token_id).expect("Not listed");
        let buyer=env::predecessor_account_id();
        require!(buyer!=l.seller && buyer!=env::current_account_id(), "Invalid buyer");
        require!(env::block_timestamp()<l.expires_at.0, "Listing expired");
        require!(env::attached_deposit().as_yoctonear()==l.price.0, "Exact payment required");
        self.idle(&l.seller);self.idle(&self.owner);
        let fee=l.price.0*self.fee_bps as u128/10000;
        // Ownership transfer and seller/fee credits commit together, no external callback.
        self.nft.internal_transfer(&env::current_account_id(),&buyer,&token_id,None,Some("Marketplace purchase".into()));
        self.remove_listing(&token_id,&l.seller);self.credit(&l.seller,l.price.0-fee+LISTING_STORAGE);self.credit(&self.owner.clone(),fee);
        event("settled",near_sdk::serde_json::json!({"token_id":token_id,"seller":l.seller,"buyer":buyer,"price":l.price,"fee":U128(fee)}));
    }
    #[payable]
    pub fn set_paused(&mut self, paused: bool) {assert_one_yocto();require!(env::predecessor_account_id()==self.owner, "Owner only");self.paused=paused;}
    fn balance(&self, who:&AccountId)->Balance {self.balances.get(who).expect("Register storage first")}
    fn idle(&self,who:&AccountId) {require!(self.balance(who).withdrawing==0, "Withdrawal pending");}
    fn credit(&mut self,who:&AccountId,amount:u128) {let mut b=self.balance(who);b.available=b.available.checked_add(amount).unwrap();self.balances.insert(who,&b);}
    fn remove_listing(&mut self,token_id:&TokenId,seller:&AccountId) {self.listings.remove(token_id);self.listing_counts.insert(seller,&(self.listing_counts.get(seller).unwrap()-1));}
}

#[near]
impl NonFungibleTokenCore for Contract {
    #[payable]
    fn nft_transfer(&mut self, receiver_id: AccountId, token_id: TokenId, approval_id: Option<u64>, memo: Option<String>) {
        require!(receiver_id!=env::current_account_id(), "Use list for escrow");
        require!(self.in_flight.get(&token_id).is_none() && self.listings.get(&token_id).is_none(), "Token busy");
        self.nft.nft_transfer(receiver_id,token_id,approval_id,memo);
    }
    #[payable]
    fn nft_transfer_call(&mut self, receiver_id: AccountId, token_id: TokenId, approval_id: Option<u64>, memo: Option<String>, msg: String)->PromiseOrValue<bool> {
        require!(receiver_id!=env::current_account_id(), "Use list for escrow");
        require!(self.in_flight.get(&token_id).is_none() && self.listings.get(&token_id).is_none(), "Token busy");
        self.in_flight.insert(&token_id,&true);
        self.nft.nft_transfer_call(receiver_id,token_id,approval_id,memo,msg)
    }
    fn nft_token(&self, token_id: TokenId)->Option<Token>{self.nft.nft_token(token_id)}
}
#[near]
impl NonFungibleTokenResolver for Contract {
    #[private]
    fn nft_resolve_transfer(&mut self, previous_owner_id: AccountId, receiver_id: AccountId, token_id: TokenId, approved_account_ids: Option<HashMap<AccountId,u64>>)->bool {
        self.in_flight.remove(&token_id);
        self.nft.nft_resolve_transfer(previous_owner_id,receiver_id,token_id,approved_account_ids)
    }
}
#[near]
impl NonFungibleTokenMetadataProvider for Contract {
    fn nft_metadata(&self)->NFTContractMetadata {NFTContractMetadata{spec:"nft-1.0.0".into(),name:"Deep Sea Hunter Collectibles (Testnet)".into(),symbol:"DSHC".into(),icon:None,base_uri:None,reference:None,reference_hash:None}}
}
#[allow(deprecated)]
mod enumeration {use super::*;near_contract_standards::impl_non_fungible_token_enumeration!(Contract,nft);}

#[cfg(test)]
mod tests;
