use crate::*;
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};

#[derive(Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
pub struct CrankPop {
    pub crank: Uuid,
    pub reward_recipient: Uuid,
    pub pop_idx: Option<u64>,
}
impl Action for CrankPop {
    fn validate(&self, ctx: &Contract) -> Result<(), Error> {
        let crank = ctx.cranks.get(&self.crank).ok_or(Error::InvalidCrank)?;
        let popped_row = crank.peak(self.pop_idx.unwrap_or(0))?;
        let (popped_key, allowed_timestamp) = (popped_row.uuid, popped_row.next_timestamp);
        let aggregator = ctx
            .aggregators
            .get(&popped_key)
            .ok_or(Error::InvalidAggregator)?;
        let queue = ctx
            .queues
            .get(&aggregator.queue)
            .ok_or(Error::InvalidQueue)?;
        let recipient = ctx
            .escrows
            .get(&self.reward_recipient)
            .ok_or(Error::InvalidEscrow)?;
        require(!recipient.program_controlled, Error::InvalidEscrow)?;
        require(queue.mint == recipient.mint, Error::MintMismatch)?;

        // First stanza ensures no external open round calls occured which
        // we need to fix up in next pop.
        if aggregator.next_allowed_update_time == allowed_timestamp
            && allowed_timestamp > now_seconds()
        {
            return Error::CrankNoElementsReady.into();
        }
        Ok(())
    }

    fn actuate(&self, ctx: &mut Contract) -> Result<(), Error> {
        let mut crank = ctx.cranks.get(&self.crank).unwrap();
        let mut aggregator = ctx
            .aggregators
            .get(&crank.pop(self.pop_idx.unwrap_or(0))?)
            .ok_or(Error::InvalidAggregator)?;

        // Crank was changed.
        // Remove aggregator from the crank and dont re-push or call round open.
        if aggregator.crank != crank.address {
            aggregator.crank_row_count = 0;
            // msg!("Crank no-op");
            ctx.aggregators.insert(&aggregator.address, &aggregator);
            ctx.cranks.insert(&self.crank, &crank);
            return Ok(());
        }

        let open_round_ix = AggregatorOpenRound {
            aggregator: aggregator.address,
            jitter: crank.jitter_modifier,
            reward_recipient: self.reward_recipient,
        };
        let open_round_validate = open_round_ix.validate(ctx);
        let mut next_timestamp = 0;
        let mut reschedule = true;
        if open_round_validate.is_ok() {
            open_round_ix.actuate(ctx)?;
            next_timestamp = ctx
                .aggregators
                .get(&aggregator.address)
                .unwrap()
                .next_allowed_update_time;
        } else if open_round_validate.err().unwrap() == Error::AggregatorIllegalRoundOpenCall {
            next_timestamp = ctx
                .aggregators
                .get(&aggregator.address)
                .unwrap()
                .next_allowed_update_time;
        } else if open_round_validate.err().unwrap() == Error::InsufficientQueueSize {
            next_timestamp = now_seconds()
                .checked_add(aggregator.min_update_delay_seconds.into())
                .unwrap();
        } else {
            reschedule = false;
            near_sdk::env::log_str(&format!("{:?}", open_round_validate.err().unwrap()));
        }
        if reschedule {
            // Re-load aggregator after open-round
            let new_row = CrankRow {
                uuid: aggregator.address,
                next_timestamp,
            };
            crank.push(new_row)?;
            crank.jitter_modifier = crank.jitter_modifier.wrapping_add(1);
        } else {
            let mut aggregator = ctx
                .aggregators
                .get(&aggregator.address)
                .ok_or(Error::InvalidAggregator)?;
            aggregator.crank_row_count = 0;
            ctx.aggregators.insert(&aggregator.address, &aggregator);
        }
        ctx.cranks.insert(&self.crank, &crank);
        Ok(())
    }
}
