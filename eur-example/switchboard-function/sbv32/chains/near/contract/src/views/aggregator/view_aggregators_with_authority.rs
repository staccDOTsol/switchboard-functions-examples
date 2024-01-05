use crate::*;
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};

#[derive(Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
pub struct ViewAggregatorsWithAuthority {
    pub authority: String,
}
impl ViewAggregatorsWithAuthority {
    pub fn actuate(&self, ctx: &Contract) -> Result<Vec<Uuid>, Error> {
        let aggregators = ctx.aggregators.values_as_vector();
        let mut res = Vec::new();
        for aggregator in aggregators.iter() {
            if aggregator.authority == self.authority {
                res.push(aggregator.address);
            }
        }
        Ok(res)
    }
}
