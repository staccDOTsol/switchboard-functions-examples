use crate::*;
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};

#[derive(Default, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
pub struct ViewJob {
    pub address: Uuid,
}
impl ViewJob {
    pub fn actuate(&self, ctx: &Contract) -> Result<Job, Error> {
        let job = ctx.jobs.get(&self.address).ok_or(Error::InvalidJob)?;
        Ok(job)
    }
}
