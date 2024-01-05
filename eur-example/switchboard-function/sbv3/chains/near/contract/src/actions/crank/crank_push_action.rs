use crate::*;
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};

#[derive(Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
pub struct CrankPush {
    pub crank: Uuid,
    pub aggregator: Uuid,
}
impl Action for CrankPush {
    fn validate(&self, ctx: &Contract) -> Result<(), Error> {
        ctx.cranks.get(&self.crank).ok_or(Error::InvalidCrank)?;
        let aggregator = ctx
            .aggregators
            .get(&self.aggregator)
            .ok_or(Error::InvalidAggregator)?;
        if aggregator.crank != Uuid::default() {
            require(aggregator.crank == self.crank, Error::InvalidCrank)?;
        }
        require(aggregator.crank_row_count == 0, Error::ExcessiveCrankPushes)?;
        Ok(())
    }

    fn actuate(&self, ctx: &mut Contract) -> Result<(), Error> {
        let mut crank = ctx.cranks.get(&self.crank).unwrap();
        let mut aggregator = ctx.aggregators.get(&self.aggregator).unwrap();
        let next_timestamp = now_seconds() + aggregator.min_update_delay_seconds as u64;
        aggregator.crank_row_count += 1;
        aggregator.next_allowed_update_time = next_timestamp;
        aggregator.crank = crank.address;

        near_sdk::env::log_str(&format!(
            "TIME {:?}",
            now_seconds() + aggregator.min_update_delay_seconds as u64
        ));
        // TODO: add storage deposit check
        crank.push(CrankRow {
            uuid: self.aggregator,
            next_timestamp: std::cmp::max(aggregator.start_after.into(), next_timestamp),
        })?;
        ctx.cranks.insert(&self.crank, &crank);
        ctx.aggregators.insert(&self.aggregator, &aggregator);
        Ok(())
    }
}
