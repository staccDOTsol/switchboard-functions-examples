use crate::*;
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};

#[derive(Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
pub struct AggregatorFund {
    pub address: Uuid,
    pub funder: Uuid,
    pub amount: U128,
}
impl Action for AggregatorFund {
    fn validate(&self, ctx: &Contract) -> Result<(), Error> {
        let funder = ctx.escrows.get(&self.funder).ok_or(Error::InvalidEscrow)?;
        assert_authorized(&funder)?;
        require(!funder.program_controlled, Error::InvalidEscrow)?;
        Ok(())
    }

    fn actuate(&self, ctx: &mut Contract) -> Result<(), Error> {
        let aggregator = ctx.aggregators.get(&self.address).unwrap();
        let mut escrow = aggregator.escrow(ctx);
        let mut funder = ctx.escrows.get(&self.funder).unwrap();
        funder.send(ctx, &mut escrow, self.amount.0)?;
        Ok(())
    }
}
