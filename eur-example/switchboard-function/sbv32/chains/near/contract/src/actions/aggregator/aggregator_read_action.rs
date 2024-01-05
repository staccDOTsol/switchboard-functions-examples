use crate::error::Error;
use crate::*;
use near_sdk::serde::{Deserialize, Serialize};

#[derive(Default, Debug, Clone, Serialize, Deserialize)]
pub struct AggregatorRead {
    pub address: Uuid,
    pub payer: Uuid,
}
impl AggregatorRead {
    pub fn validate(&self, ctx: &Contract) -> Result<(), Error> {
        let aggregator = ctx
            .aggregators
            .get(&self.address)
            .ok_or(Error::InvalidAggregator)?;
        // require(
        // aggregator.latest_confirmed_round.id > 0,
        // Error::AggregatorEmpty,
        // )?;
        if aggregator.read_charge > 0 {
            let payer = ctx.escrows.get(&self.payer).ok_or(Error::InvalidEscrow)?;
            require(!payer.program_controlled, Error::InvalidEscrow)?;
            let queue = ctx
                .queues
                .get(&aggregator.queue)
                .ok_or(Error::InvalidQueue)?;
            require(queue.mint == payer.mint, Error::MintMismatch)?;
            let reward_wallet = ctx.escrows.get(&aggregator.reward_escrow).unwrap();
            payer.simulate_send(ctx, &reward_wallet, aggregator.read_charge)?;
        }
        Ok(())
    }

    pub fn actuate(&self, ctx: &mut Contract) -> Result<AggregatorRound, Error> {
        let aggregator = ctx.aggregators.get(&self.address).unwrap();
        if aggregator.read_charge > 0 {
            let mut reward_wallet = ctx.escrows.get(&aggregator.reward_escrow).unwrap();
            let mut payer = ctx.escrows.get(&self.payer).unwrap();
            payer
                .send(ctx, &mut reward_wallet, aggregator.read_charge)
                .unwrap();
        }
        Ok(aggregator.latest_confirmed_round)
    }
}
