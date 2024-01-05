use crate::*;
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};

#[derive(Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
pub struct ViewCrank {
    pub address: Uuid,
}
impl ViewCrank {
    pub fn actuate(&self, ctx: &Contract) -> Result<CrankView, Error> {
        let crank = ctx.cranks.get(&self.address).ok_or(Error::InvalidCrank)?;
        Ok(crank.into())
    }
}
