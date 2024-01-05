use crate::error::Error;
use crate::*;
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::serde::{Deserialize, Serialize};

#[derive(Default, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
pub struct AggregatorRemoveJob {
    pub address: Uuid,
    pub idx: u32,
}
impl Action for AggregatorRemoveJob {
    fn validate(&self, ctx: &Contract) -> Result<(), Error> {
        let aggregator = ctx
            .aggregators
            .get(&self.address)
            .ok_or(Error::InvalidAggregator)?;
        let idx: usize = self.idx.try_into().unwrap();
        require(idx < aggregator.jobs.len(), Error::InvalidJob)?;
        assert_authorized(&aggregator)?;
        Ok(())
    }

    fn actuate(&self, ctx: &mut Contract) -> Result<(), Error> {
        let mut aggregator = ctx.aggregators.get(&self.address).unwrap();
        let idx = self.idx.try_into().unwrap();
        let job_key = aggregator.jobs[idx];
        let mut job = ctx.jobs.get(&job_key).unwrap();
        job.reference_count = job.reference_count.checked_sub(1).unwrap();
        aggregator.jobs.swap_remove(idx);
        aggregator.job_weights.swap_remove(idx);
        aggregator.jobs_checksum = aggregator.generate_checksum(ctx);
        ctx.aggregators.insert(&self.address, &aggregator);
        ctx.jobs.insert(&job_key, &job);
        // TODO: add storage withdraw check
        Ok(())
    }
}
