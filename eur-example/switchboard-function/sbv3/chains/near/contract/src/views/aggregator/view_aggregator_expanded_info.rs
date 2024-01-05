use crate::*;
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};

#[derive(Default, Clone, BorshDeserialize, BorshSerialize, Serialize, Deserialize)]
pub struct ViewAggregatorExpandedInfo {
    pub address: Uuid,
}
impl ViewAggregatorExpandedInfo {
    pub fn actuate(&self, ctx: &Contract) -> Result<AggregatorExpandedInfo, Error> {
        let aggregator = ctx
            .aggregators
            .get(&self.address)
            .ok_or(Error::InvalidAggregator)?;
        let queue = ctx.queues.get(&self.address).ok_or(Error::InvalidQueue)?;
        let mut jobs = Vec::new();
        for job_key in aggregator.jobs.iter() {
            jobs.push(ctx.jobs.get(&job_key).unwrap());
        }
        Ok(AggregatorExpandedInfo {
            queue: queue.into(),
            aggregator: aggregator.into(),
            jobs,
        })
    }
}

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize)]
pub struct AggregatorExpandedInfo {
    pub queue: OracleQueueView,
    pub aggregator: AggregatorView,
    pub jobs: Vec<Job>,
}
