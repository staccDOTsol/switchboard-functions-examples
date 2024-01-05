use crate::*;
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
pub struct EscrowFund {
    pub address: Uuid,
    pub amount: U128,
}
impl Action for EscrowFund {
    fn validate(&self, ctx: &Contract) -> Result<(), Error> {
        let escrow = ctx.escrows.get(&self.address).ok_or(Error::InvalidEscrow)?;
        require(!escrow.program_controlled, Error::PermissionDenied)?;
        Ok(())
    }

    fn actuate(&self, ctx: &mut Contract) -> Result<(), Error> {
        let mut escrow = ctx.escrows.get(&self.address).unwrap();
        escrow.amount = escrow.amount.checked_add(self.amount.0).unwrap();
        ctx.escrows.insert(&self.address, &escrow);
        Ok(())
    }
}
