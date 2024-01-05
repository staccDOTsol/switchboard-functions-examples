pub mod actions;
pub mod error;
pub mod event;
pub mod impls;
pub mod macros;
pub mod utils;
pub mod views;
pub use actions::*;
pub use error::*;
pub use event::*;
pub use impls::*;
pub use macros::*;
pub use utils::*;
pub use views::*;

use env::predecessor_account_id;
use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::collections::vector::Vector;
use near_sdk::collections::UnorderedMap;
use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::Promise;
use near_sdk::{env, near_bindgen, AccountId, PanicOnDefault, PromiseOrValue};
use serde::{Deserialize, Serialize};
use serde_json;
use sha2::{Digest, Sha256};
use std::convert::TryInto;

pub type Address = [u8; 32];
pub type Uuid = [u8; 32];

#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize, PanicOnDefault)]
pub struct Contract {
    state: State,
    aggregators: UnorderedMap<Uuid, Aggregator>,
    queues: UnorderedMap<Uuid, OracleQueue>,
    cranks: UnorderedMap<Uuid, Crank>,
    oracles: UnorderedMap<Uuid, Oracle>,
    jobs: UnorderedMap<Uuid, Job>,

    permissions: UnorderedMap<Address, Permission>,
    escrows: UnorderedMap<Address, Escrow>,
    _emap: UnorderedMap<[u8; 32], Vec<u8>>,
}

#[near_bindgen]
impl Contract {
    // Init must be called with contracts keypair.
    #[init]
    pub fn init() -> Self {
        assert!(!env::state_exists(), "Already initialized");
        Self {
            state: Default::default(),
            aggregators: UnorderedMap::new(&b"xAggregatorsMap"[..]),
            queues: UnorderedMap::new(&b"xQueuesMap"[..]),
            cranks: UnorderedMap::new(&b"xCrankMap"[..]),
            oracles: UnorderedMap::new(&b"xOraclesMap"[..]),
            jobs: UnorderedMap::new(&b"xJobsMap"[..]),
            permissions: UnorderedMap::new(&b"xPermissionsMap"[..]),
            escrows: UnorderedMap::new(&b"xEscrowsMap"[..]),
            _emap: UnorderedMap::new(&b"xEMAP"[..]),
        }
    }
    #[payable]
    pub fn aggregator_add_history(&mut self, ix: AggregatorAddHistory) -> Promise {
        ix.run(self)
    }
    #[payable]
    pub fn aggregator_add_job(&mut self, ix: AggregatorAddJob) -> Promise {
        ix.run(self)
    }
    #[payable]
    pub fn aggregator_fund(&mut self, ix: AggregatorFund) -> Promise {
        ix.run(self)
    }
    #[payable]
    pub fn aggregator_withdraw(&mut self, ix: AggregatorWithdraw) -> Promise {
        ix.run(self)
    }
    #[payable]
    pub fn aggregator_init(&mut self, ix: AggregatorInit) -> Promise {
        ix.run(self)
    }
    #[payable]
    pub fn aggregator_open_round(&mut self, ix: AggregatorOpenRound) -> Promise {
        ix.run(self)
    }
    #[payable]
    pub fn aggregator_remove_job(&mut self, ix: AggregatorRemoveJob) -> Promise {
        ix.run(self)
    }
    #[payable]
    pub fn aggregator_save_result(&mut self, ix: AggregatorSaveResult) -> Promise {
        ix.run(self)
    }
    #[payable]
    pub fn aggregator_read(&mut self, ix: AggregatorRead) -> AggregatorRound {
        ix.validate(self).unwrap();
        ix.actuate(self).unwrap()
    }
    #[payable]
    pub fn aggregator_set_configs(&mut self, ix: AggregatorSetConfigs) -> Promise {
        ix.run(self)
    }
    #[payable]
    pub fn crank_init(&mut self, ix: CrankInit) -> Promise {
        ix.run(self)
    }
    #[payable]
    pub fn crank_pop(&mut self, ix: CrankPop) -> Promise {
        ix.run(self)
    }
    #[payable]
    pub fn crank_push(&mut self, ix: CrankPush) -> Promise {
        ix.run(self)
    }
    #[payable]
    pub fn escrow_init(&mut self, ix: EscrowInit) -> Promise {
        ix.run(self)
    }
    #[payable]
    pub fn escrow_withdraw(&mut self, ix: EscrowWithdraw) -> Promise {
        let promise1 = ix.run(self);
        let escrow = self.escrows.get(&ix.address).unwrap();
        require(
            remaining_gas() > near_sdk::Gas::ONE_TERA,
            Error::InsufficientGas,
        )
        .unwrap();
        promise1.then(Promise::new(escrow.mint.parse().unwrap()).function_call(
            "ft_transfer_call".into(),
            json_buf!({
                "receiver_id": ix.destination,
                "amount": U128(ix.amount),
                "msg": serde_json::ser::to_string(&ix).unwrap()
            }),
            near_sdk::ONE_YOCTO,
            near_sdk::Gas::ONE_TERA,
        ))
        // TODO: need rollback logic?
    }
    #[payable]
    pub fn job_init(&mut self, ix: JobInit) -> Promise {
        ix.run(self)
    }
    #[payable]
    pub fn oracle_init(&mut self, ix: OracleInit) -> Promise {
        ix.run(self)
    }
    #[payable]
    pub fn oracle_heartbeat(&mut self, ix: OracleHeartbeat) -> Promise {
        ix.run(self)
    }
    #[payable]
    pub fn oracle_stake(&mut self, ix: OracleStake) -> Promise {
        ix.run(self)
    }
    #[payable]
    pub fn oracle_unstake(&mut self, ix: OracleUnstake) -> Promise {
        ix.run(self)
    }
    #[payable]
    pub fn oracle_queue_init(&mut self, ix: OracleQueueInit) -> Promise {
        ix.run(self)
    }
    #[payable]
    pub fn oracle_queue_set_configs(&mut self, ix: OracleQueueSetConfigs) -> Promise {
        ix.run(self)
    }
    #[payable]
    pub fn permission_init(&mut self, ix: PermissionInit) -> Promise {
        ix.run(self)
    }
    #[payable]
    pub fn permission_set(&mut self, ix: PermissionSet) -> Promise {
        ix.run(self)
    }

    pub fn view_aggregator_expanded_info(
        &self,
        ix: &ViewAggregatorExpandedInfo,
    ) -> AggregatorExpandedInfo {
        ix.actuate(self).unwrap()
    }
    pub fn view_aggregator(&self, ix: &ViewAggregator) -> AggregatorView {
        ix.actuate(self).unwrap()
    }
    pub fn view_aggregator_history(&self, ix: &ViewAggregatorHistory) -> AggregatorHistoryPageView {
        ix.actuate(self).unwrap()
    }
    pub fn view_aggregator_keys(&self, ix: &ViewAggregatorKeys) -> Vec<Uuid> {
        ix.actuate(self).unwrap()
    }
    pub fn view_aggregators_on_queue(&self, ix: &ViewAggregatorsOnQueue) -> Vec<Uuid> {
        ix.actuate(self).unwrap()
    }
    pub fn view_aggregators_with_authority(&self, ix: &ViewAggregatorsWithAuthority) -> Vec<Uuid> {
        ix.actuate(self).unwrap()
    }
    pub fn view_aggregators_state_with_authority(
        &self,
        ix: &ViewAggregatorsStateWithAuthority,
    ) -> Vec<AggregatorView> {
        ix.actuate(self).unwrap()
    }
    pub fn view_crank(&self, ix: &ViewCrank) -> CrankView {
        ix.actuate(self).unwrap()
    }
    pub fn view_escrow(&self, ix: &ViewEscrow) -> Escrow {
        ix.actuate(self).unwrap()
    }
    pub fn view_all_escrows(&self, ix: &ViewAllEscrows) -> Vec<(Address, Escrow)> {
        ix.actuate(self).unwrap()
    }
    pub fn view_job(&self, ix: &ViewJob) -> Job {
        ix.actuate(self).unwrap()
    }
    pub fn view_jobs(&self, ix: &ViewJobs) -> Vec<Job> {
        ix.actuate(self).unwrap()
    }
    pub fn view_oracle(&self, ix: &ViewOracle) -> Oracle {
        ix.actuate(self).unwrap()
    }
    pub fn view_permission(&self, ix: &ViewPermission) -> Permission {
        ix.actuate(self).unwrap()
    }
    pub fn view_queue(&self, ix: &ViewQueue) -> OracleQueueView {
        ix.actuate(self).unwrap()
    }
    pub fn view_all_queues(&self, ix: &ViewAllQueues) -> Vec<Uuid> {
        ix.actuate(self).unwrap()
    }
}

#[near_bindgen]
impl FungibleTokenReceiver for Contract {
    fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        let ix: EscrowFund = serde_json::de::from_str(&msg).unwrap();
        let escrow = self
            .escrows
            .get(&ix.address)
            .ok_or(Error::InvalidEscrow)
            .unwrap();
        let mint: AccountId = escrow.mint.parse().unwrap();
        require(predecessor_account_id() == mint, Error::MintMismatch).unwrap();
        // require(is_promise_success(), Error::PredecessorFailed).unwrap();
        require(ix.amount == amount, Error::InvalidAmount).unwrap();
        ix.validate(self).unwrap();
        ix.actuate(self).unwrap();
        PromiseOrValue::Value(U128(0))
    }
}

#[derive(Default, BorshDeserialize, BorshSerialize)]
pub struct State {
    pub authority: Uuid,
    pub token_mint: Uuid,
    pub token_vault: Uuid,
    pub dao_mint: Uuid,
}
