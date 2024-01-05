use crate::*;
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};

#[derive(Default, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
pub struct ViewOracle {
    pub address: Uuid,
}
impl ViewOracle {
    pub fn actuate(&self, ctx: &Contract) -> Result<Oracle, Error> {
        let oracle = ctx.oracles.get(&self.address).ok_or(Error::InvalidOracle)?;
        Ok(oracle)
    }
}
