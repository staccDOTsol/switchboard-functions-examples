use crate::error::Error;
use crate::*;
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::serde::{Deserialize, Serialize};
use std::vec::Vec;

const MAX_BATCH_SIZE: u32 = 10;

#[derive(Default, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
pub struct AggregatorSetConfigs {
    pub address: Uuid,
    pub authority: Option<String>,
    pub queue: Option<Uuid>,
    pub name: Option<Vec<u8>>,
    pub metadata: Option<Vec<u8>>,
    pub batch_size: Option<u32>,
    pub min_oracle_results: Option<u32>,
    pub min_job_results: Option<u32>,
    pub min_update_delay_seconds: Option<u32>,
    pub start_after: Option<u64>,
    pub variance_threshold: Option<SwitchboardDecimal>,
    pub force_report_period: Option<u64>,
    pub crank: Option<Uuid>,
    pub reward_escrow: Option<Uuid>,
    pub read_charge: Option<U128>,
}
impl Action for AggregatorSetConfigs {
    fn validate(&self, ctx: &Contract) -> Result<(), Error> {
        let aggregator = ctx
            .aggregators
            .get(&self.address)
            .ok_or(Error::InvalidAggregator.into())?;
        if self.queue.is_some() {
            ctx.queues
                .get(&self.queue.unwrap())
                .ok_or(Error::InvalidQueue.into())?;
        }
        if self.batch_size.is_some() && self.batch_size.unwrap() > MAX_BATCH_SIZE {
            return Error::AggregatorInvalidBatchSize.into();
        }
        if self.min_oracle_results.is_some()
            && self.min_oracle_results.unwrap() > aggregator.oracle_request_batch_size
        {
            return Error::AggregatorInvalidBatchSize.into();
        }
        if self.min_update_delay_seconds.is_some() && self.min_update_delay_seconds.unwrap() < 5 {
            return Error::InvalidUpdatePeriod.into();
        }
        if self.crank.is_some() && self.crank.unwrap() != Uuid::default() {
            ctx.cranks
                .get(&self.crank.unwrap())
                .ok_or(Error::InvalidCrank.into())?;
        }
        assert_authorized(&aggregator)?;
        Ok(())
    }

    fn actuate(&self, ctx: &mut Contract) -> Result<(), Error> {
        let mut aggregator = ctx.aggregators.get(&self.address).unwrap();
        aggregator.authority = self
            .authority
            .as_ref()
            .unwrap_or(&aggregator.authority)
            .clone();
        aggregator.queue = self.queue.unwrap_or(aggregator.queue);
        aggregator.name = shrink_to(self.name.as_ref().unwrap_or(&aggregator.name).clone(), 256);
        aggregator.metadata = shrink_to(
            self.metadata
                .as_ref()
                .unwrap_or(&aggregator.metadata)
                .clone(),
            256,
        );
        aggregator.oracle_request_batch_size = self
            .batch_size
            .unwrap_or(aggregator.oracle_request_batch_size);
        aggregator.min_oracle_results = self
            .min_oracle_results
            .unwrap_or(aggregator.min_oracle_results);
        aggregator.min_job_results = self.min_job_results.unwrap_or(aggregator.min_job_results);
        aggregator.min_update_delay_seconds = self
            .min_update_delay_seconds
            .unwrap_or(aggregator.min_update_delay_seconds);
        aggregator.start_after = self.start_after.unwrap_or(aggregator.start_after);
        aggregator.variance_threshold = self
            .variance_threshold
            .unwrap_or(aggregator.variance_threshold);
        aggregator.force_report_period = self
            .force_report_period
            .unwrap_or(aggregator.force_report_period);
        aggregator.crank = self.crank.unwrap_or(aggregator.crank);
        if self.read_charge.is_some() {
            aggregator.read_charge = self.read_charge.unwrap().0
        }

        aggregator.reward_escrow = self.reward_escrow.unwrap_or(aggregator.reward_escrow);

        let queue = ctx.queues.get(&aggregator.queue).unwrap();
        let escrow_key = aggregator.escrow_key(&queue.mint);

        let reward_escrow = ctx
            .escrows
            .get(&aggregator.reward_escrow)
            .ok_or(Error::InvalidEscrow)?;
        // require(!reward_escrow.program_controlled, Error::InvalidEscrow)?;
        if reward_escrow.mint != queue.mint {
            // Fall back reward escrow to lease escrow
            aggregator.reward_escrow = escrow_key;
        }

        ctx.aggregators.insert(&self.address, &aggregator);

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
        Ok(())
    }
}
