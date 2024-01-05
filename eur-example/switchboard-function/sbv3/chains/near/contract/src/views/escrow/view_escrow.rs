use crate::*;
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};

#[derive(Default, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
pub struct ViewEscrow {
    pub address: Uuid,
}
impl ViewEscrow {
    pub fn actuate(&self, ctx: &Contract) -> Result<Escrow, Error> {
        //let escrow = ctx.escrows.get(&self.address).ok_or(Error::InvalidEscrow)?;
        let escrow = ctx.escrows.get(&self.address).unwrap();
        Ok(escrow)
    }
}

#[derive(Default, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
pub struct ViewAllEscrows {}
impl ViewAllEscrows {
    pub fn actuate(&self, ctx: &Contract) -> Result<Vec<(Address, Escrow)>, Error> {
        Ok(ctx.escrows.to_vec())
    }
}
