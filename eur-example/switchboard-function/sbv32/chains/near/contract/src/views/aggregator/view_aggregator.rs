use crate::*;
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};

#[derive(Default, Clone, BorshDeserialize, BorshSerialize, Serialize, Deserialize)]
pub struct ViewAggregator {
    pub address: Uuid,
}
impl ViewAggregator {
    pub fn actuate(&self, ctx: &Contract) -> Result<AggregatorView, Error> {
        let aggregator = ctx
            .aggregators
            .get(&self.address)
            .ok_or(Error::InvalidAggregator)?;
        Ok(aggregator.into())
    }
}
