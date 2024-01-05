use crate::*;
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};

#[derive(Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
pub struct EscrowWithdraw {
    pub address: Uuid,
    pub amount: u128,
    pub destination: AccountId,
}
impl Action for EscrowWithdraw {
    fn validate(&self, ctx: &Contract) -> Result<(), Error> {
        let escrow = ctx.escrows.get(&self.address).ok_or(Error::InvalidEscrow)?;
        // TODO: think how to do. CHEKC NOTES, MAKE AUTHORITY ALWAYS REQUIRED
        require(!escrow.program_controlled, Error::PermissionDenied)?;
        require(
            self.amount <= escrow.available_amount(),
            Error::InsufficientBalance,
        )?;
        assert_authorized(&escrow)?;
        Ok(())
    }

    fn actuate(&self, ctx: &mut Contract) -> Result<(), Error> {
        let mut escrow = ctx.escrows.get(&self.address).unwrap();
        escrow.amount = escrow.amount.checked_sub(self.amount).unwrap();
        ctx.escrows.insert(&self.address, &escrow);
        Ok(())
    }
}
