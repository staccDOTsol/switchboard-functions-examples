use crate::*;
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};

#[derive(Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
pub struct AggregatorWithdraw {
    pub address: Uuid,
    pub destination: Uuid,
    pub amount: U128,
}
impl Action for AggregatorWithdraw {
    fn validate(&self, ctx: &Contract) -> Result<(), Error> {
        let destination = ctx
            .escrows
            .get(&self.destination)
            .ok_or(Error::InvalidEscrow)?;
        require(!destination.program_controlled, Error::InvalidEscrow)?;
        let aggregator = ctx
            .aggregators
            .get(&self.address)
            .ok_or(Error::InvalidAggregator)?;
        let escrow = aggregator.escrow(ctx);
        escrow.simulate_send(ctx, &destination, self.amount.0)?;
        assert_authorized(&aggregator)?;
        Ok(())
    }

    fn actuate(&self, ctx: &mut Contract) -> Result<(), Error> {
        let aggregator = ctx.aggregators.get(&self.address).unwrap();
        let mut escrow = aggregator.escrow(ctx);
        let mut destination = ctx.escrows.get(&self.destination).unwrap();
        escrow.send(ctx, &mut destination, self.amount.0).unwrap();
        Ok(())
    }
}
