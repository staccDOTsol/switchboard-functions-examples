use crate::error::Error;
use crate::*;
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::vec::Vec;

const MAX_BATCH_SIZE: u32 = 10;

#[derive(Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
pub struct AggregatorInit {
    pub address: Uuid,
    pub authority: String,
    pub queue: Uuid,
    pub name: Vec<u8>,
    pub metadata: Vec<u8>,
    pub batch_size: u32,
    pub min_oracle_results: u32,
    pub min_job_results: u32,
    pub min_update_delay_seconds: u32,
    pub start_after: u64,
    pub variance_threshold: SwitchboardDecimal,
    pub force_report_period: u64,
    pub expiration: u64,
    pub crank: Uuid,
    pub reward_escrow: Uuid,
    pub max_gas_cost: U128,
    pub read_charge: U128,
}
impl Action for AggregatorInit {
    fn validate(&self, ctx: &Contract) -> Result<(), Error> {
        require(
            ctx.aggregators.get(&self.address).is_none(),
            Error::InvalidAggregator,
        )?;
        require(ctx.queues.get(&self.queue).is_some(), Error::InvalidQueue)?;
        // Allow default key to leave crank unset
        if self.crank != Uuid::default() && ctx.cranks.get(&self.crank).is_none() {
            return Error::InvalidCrank.into();
        }
        require(
            self.batch_size <= MAX_BATCH_SIZE,
            Error::AggregatorInvalidBatchSize,
        )?;
        require(
            self.min_oracle_results <= self.batch_size,
            Error::AggregatorInvalidBatchSize,
        )?;
        require(
            self.min_update_delay_seconds >= 5,
            Error::InvalidUpdatePeriod,
        )?;
        require(self.address != Uuid::default(), Error::InvalidKey)?;
        if self.reward_escrow != Uuid::default() {
            let queue = ctx.queues.get(&self.queue).ok_or(Error::InvalidQueue)?;
            let custom_reward_escrow = ctx
                .escrows
                .get(&self.reward_escrow)
                .ok_or(Error::InvalidEscrow)?;
            require(custom_reward_escrow.mint == queue.mint, Error::MintMismatch)?;
            require(
                !custom_reward_escrow.program_controlled,
                Error::InvalidEscrow,
            )?;
        }
        Ok(())
    }

    fn actuate(&self, ctx: &mut Contract) -> Result<(), Error> {
        let queue = ctx.queues.get(&self.queue).unwrap();
        let mut hasher = Sha256::new();
        hasher.update(b"AggregatorHistory");
        hasher.update(self.address);
        let escrow_key = Aggregator::escrow_key_from_addr(&self.address, &queue.mint);
        let mut reward_escrow = escrow_key;
        if self.reward_escrow != Uuid::default() {
            let custom_reward_escrow = ctx.escrows.get(&self.reward_escrow).unwrap();
            reward_escrow = custom_reward_escrow.address;
        }
        let aggregator = Aggregator {
            address: self.address,
            name: shrink_to(self.name.clone(), 256),
            metadata: shrink_to(self.metadata.clone(), 256),
            queue: self.queue,
            oracle_request_batch_size: self.batch_size,
            min_oracle_results: self.min_oracle_results,
            min_job_results: self.min_job_results,
            min_update_delay_seconds: self.min_update_delay_seconds,
            start_after: self.start_after,
            variance_threshold: self.variance_threshold,
            force_report_period: self.force_report_period,
            expiration: self.expiration,
            crank: self.crank,
            authority: self.authority.clone(),
            creation_timestamp: now_seconds(),
            history: Vector::new(&hasher.finalize()[..]),
            consecutive_failure_count: 0,
            current_round: Default::default(),
            history_limit: 0,
            history_write_idx: 0,
            is_locked: false,
            jobs: Default::default(),
            job_weights: Default::default(),
            jobs_checksum: Default::default(),
            latest_confirmed_round: Default::default(),
            next_allowed_update_time: Default::default(),
            previous_confirmed_round_result: Default::default(),
            previous_confirmed_round_slot: Default::default(),
            crank_row_count: 0,
            read_charge: self.read_charge.0,
            reward_escrow: reward_escrow,
            max_gas_cost: self.max_gas_cost.0,
            whitelisted_readers: Default::default(),
            allow_whitelist_only: false,
            _ebuf: Default::default(),
            features: Default::default(),
        };
        let escrow = Escrow {
            address: escrow_key,
            mint: queue.mint,
            amount: 0,
            authority: None,
            amount_locked: 0,
            program_controlled: true,
            creation_timestamp: now_seconds(),
            last_transfer_timestamp: 0,
            last_delegation_timestamp: 0,
            last_delegation_block: 0,
            _ebuf: Default::default(),
            features: Default::default(),
        };
        if ctx.escrows.get(&escrow_key).is_none() {
            // TODO: add storage deposit check
            ctx.escrows.insert(&escrow_key, &escrow);
        }
        // TODO: add storage deposit check
        ctx.aggregators.insert(&self.address, &aggregator);
        Ok(())
    }
}
