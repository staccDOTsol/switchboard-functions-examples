use crate::*;
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};

#[derive(Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
pub struct OracleStake {
    pub address: Uuid,
    pub funder: Uuid,
    pub amount: U128,
}
impl Action for OracleStake {
    fn validate(&self, ctx: &Contract) -> Result<(), Error> {
        let oracle = ctx.oracles.get(&self.address).ok_or(Error::InvalidOracle)?;
        let funder = ctx.escrows.get(&self.funder).ok_or(Error::InvalidEscrow)?;
        assert_authorized(&funder)?;
        require(!funder.program_controlled, Error::InvalidEscrow)?;
        funder.simulate_send(ctx, &oracle.escrow(ctx), self.amount.0)?;
        Ok(())
    }

    fn actuate(&self, ctx: &mut Contract) -> Result<(), Error> {
        let oracle = ctx.oracles.get(&self.address).unwrap();
        let mut escrow = oracle.escrow(ctx);
        let mut funder = ctx.escrows.get(&self.funder).unwrap();
        funder.send(ctx, &mut escrow, self.amount.0).unwrap();
        Ok(())
    }
}
