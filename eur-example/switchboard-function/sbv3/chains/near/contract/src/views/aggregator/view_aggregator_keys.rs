use crate::*;
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};

#[derive(Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
pub struct ViewAggregatorKeys {}
impl ViewAggregatorKeys {
    pub fn actuate(&self, ctx: &Contract) -> Result<Vec<Uuid>, Error> {
        let aggregators = ctx.aggregators.keys_as_vector().to_vec();
        Ok(aggregators)
    }
}
