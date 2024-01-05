use crate::*;
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};

#[derive(Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
pub struct ViewQueue {
    pub address: Uuid,
}
impl ViewQueue {
    pub fn actuate(&self, ctx: &Contract) -> Result<OracleQueueView, Error> {
        let queue = ctx.queues.get(&self.address).ok_or(Error::InvalidQueue)?;
        Ok(queue.into())
    }
}
