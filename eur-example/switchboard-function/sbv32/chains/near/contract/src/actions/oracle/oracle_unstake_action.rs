use crate::*;
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};

#[derive(Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
pub struct OracleUnstake {
    pub oracle: Uuid,
    pub destination: Uuid,
    pub amount: U128,
    pub delegate: bool,
}
// TODO: Check if oracle goes below needed stake
impl Action for OracleUnstake {
    fn validate(&self, ctx: &Contract) -> Result<(), Error> {
        require(self.delegate == false, Error::Unimplemented)?;
        let destination = ctx
            .escrows
            .get(&self.destination)
            .ok_or(Error::InvalidEscrow)?;
        require(!destination.program_controlled, Error::InvalidEscrow)?;
        assert_authorized(&destination)?;
        let oracle = ctx.oracles.get(&self.oracle).ok_or(Error::InvalidOracle)?;
        destination.simulate_send(ctx, &oracle.escrow(ctx), self.amount.0)?;
        Ok(())
    }

    fn actuate(&self, ctx: &mut Contract) -> Result<(), Error> {
        let oracle = ctx.oracles.get(&self.oracle).unwrap();
        let mut destination = ctx.escrows.get(&self.destination).unwrap();
        destination
            .send(ctx, &mut oracle.escrow(ctx), self.amount.0)
            .unwrap();
        Ok(())
    }
}
