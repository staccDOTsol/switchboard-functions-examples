use crate::error::Error;
use crate::*;
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::serde::{Deserialize, Serialize};

#[derive(Default, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
pub struct AggregatorAddJob {
    pub address: Uuid,
    pub job: Uuid,
    pub weight: u8,
}
impl Action for AggregatorAddJob {
    fn validate(&self, ctx: &Contract) -> Result<(), Error> {
        let aggregator = ctx
            .aggregators
            .get(&self.address)
            .ok_or(Error::InvalidAggregator)?;
        ctx.jobs.get(&self.job).ok_or(Error::InvalidJob)?;
        assert_authorized(&aggregator)?;
        Ok(())
    }

    fn actuate(&self, ctx: &mut Contract) -> Result<(), Error> {
        let mut aggregator = ctx.aggregators.get(&self.address).unwrap();
        let mut job = ctx.jobs.get(&self.job).unwrap();
        job.reference_count = job.reference_count.checked_add(1).unwrap();
        aggregator.jobs.push(self.job);
        aggregator.job_weights.push(self.weight);
        aggregator.jobs_checksum = aggregator.generate_checksum(ctx);
        ctx.aggregators.insert(&self.address, &aggregator);
        ctx.jobs.insert(&self.job, &job);
        // TODO: add storage deposit check
        Ok(())
    }
}
