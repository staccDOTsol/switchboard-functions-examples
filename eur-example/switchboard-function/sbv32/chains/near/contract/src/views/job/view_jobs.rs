use crate::*;
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};

#[derive(Default, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
pub struct ViewJobs {
    pub addresses: Vec<Uuid>,
}
impl ViewJobs {
    pub fn actuate(&self, ctx: &Contract) -> Result<Vec<Job>, Error> {
        let mut res = Vec::with_capacity(self.addresses.len());
        for addr in self.addresses.iter() {
            res.push(ctx.jobs.get(&addr).ok_or(Error::InvalidJob)?);
        }
        Ok(res)
    }
}
