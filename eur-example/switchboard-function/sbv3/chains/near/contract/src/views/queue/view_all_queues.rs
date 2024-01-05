use crate::*;
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};

#[derive(Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
pub struct ViewAllQueues {}
impl ViewAllQueues {
    pub fn actuate(&self, ctx: &Contract) -> Result<Vec<Uuid>, Error> {
        Ok(ctx.queues.keys_as_vector().to_vec())
    }
}
