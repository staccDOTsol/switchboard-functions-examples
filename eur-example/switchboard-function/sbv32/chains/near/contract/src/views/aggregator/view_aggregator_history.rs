use crate::*;
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};

#[derive(Default, Clone, BorshDeserialize, BorshSerialize, Serialize, Deserialize)]
pub struct ViewAggregatorHistory {
    pub address: Uuid,
    pub page: u32,
}
impl ViewAggregatorHistory {
    pub fn actuate(&self, ctx: &Contract) -> Result<AggregatorHistoryPageView, Error> {
        let aggregator = ctx
            .aggregators
            .get(&self.address)
            .ok_or(Error::InvalidAggregator)?;

        let starting_idx: u32 = (self.page).checked_mul(1000).unwrap();
        let ending_idx: u32;
        if (starting_idx + 1000) as u64 > aggregator.history_limit {
            ending_idx = aggregator.history_limit.try_into().unwrap();
        } else {
            ending_idx = starting_idx + 1000;
        }

        let mut history: Vec<AggregatorHistoryRow> = vec![];
        for n in starting_idx..ending_idx {
            let row = aggregator
                .history
                .get(n as u64)
                .unwrap_or(AggregatorHistoryRow::default());
            history.push(row);
        }

        return Ok(AggregatorHistoryPageView {
            history,
            address: self.address,
            history_write_idx: aggregator.history_write_idx,
            history_limit: aggregator.history_limit,
            page: self.page,
            starting_idx: starting_idx.try_into().unwrap(),
            ending_idx,
        });
    }
}
