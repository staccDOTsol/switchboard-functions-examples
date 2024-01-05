use crate::error::Error;
use crate::*;
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::serde::{Deserialize, Serialize};

#[derive(Default, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
pub struct AggregatorAddHistory {
    pub address: Uuid,
    pub num_rows: u32,
}
impl Action for AggregatorAddHistory {
    fn validate(&self, ctx: &Contract) -> Result<(), Error> {
        let _ = ctx
            .aggregators
            .get(&self.address)
            .ok_or(Error::InvalidAggregator)?;

        // can adjust this based on gas usage, but there is a ceiling
        require(self.num_rows <= 1000, Error::InvalidNumberOfHistoryRows)?;
        Ok(())
    }

    fn actuate(&self, ctx: &mut Contract) -> Result<(), Error> {
        let mut aggregator = ctx.aggregators.get(&self.address).unwrap();
        aggregator.add_history_rows(self.num_rows)?;
        ctx.aggregators.insert(&self.address, &aggregator);
        Ok(())
    }
}
