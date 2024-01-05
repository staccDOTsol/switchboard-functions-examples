use crate::error::Error;
use crate::*;
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::serde::{Deserialize, Serialize};

#[derive(Default, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
pub struct AggregatorOpenRound {
    pub aggregator: Uuid,
    pub jitter: u8,
    pub reward_recipient: Uuid,
}
impl Action for AggregatorOpenRound {
    fn validate(&self, ctx: &Contract) -> Result<(), Error> {
        let aggregator = ctx
            .aggregators
            .get(&self.aggregator)
            .ok_or(Error::InvalidAggregator)?;
        if aggregator.next_allowed_update_time > now_seconds() {
            return Error::AggregatorIllegalRoundOpenCall.into();
        }
        ctx.escrows
            .get(&self.reward_recipient)
            .ok_or(Error::InvalidEscrow)?;
        let queue = ctx.queues.get(&aggregator.queue).unwrap();
        require(
            queue.data.len() >= aggregator.oracle_request_batch_size.into(),
            Error::InsufficientQueueSize,
        )?;
        let maybe_permission =
            Permission::get(ctx, &queue.authority, &queue.address, &self.aggregator);
        if !queue.unpermissioned_feeds_enabled
            && !maybe_permission
                .ok_or(Error::InvalidPermission)?
                .has(SwitchboardPermission::PermitOracleQueueUsage)
        {
            return Error::PermissionDenied.into();
        }
        let aggregator_escrow = aggregator.escrow(ctx);
        let recipient_escrow = ctx.escrows.get(&self.reward_recipient).unwrap();
        require(!recipient_escrow.program_controlled, Error::InvalidEscrow)?;
        aggregator_escrow.simulate_send(ctx, &recipient_escrow, queue.reward.into())?;
        if aggregator_escrow.available_amount()
            < queue
                .max_round_rewards(aggregator.oracle_request_batch_size)
                .into()
        {
            return Error::InsufficientBalance.into();
        }
        Ok(())
    }

    fn actuate(&self, ctx: &mut Contract) -> Result<(), Error> {
        let mut aggregator = ctx.aggregators.get(&self.aggregator).unwrap();
        let mut queue = ctx.queues.get(&aggregator.queue).unwrap();
        let mut aggregator_escrow = aggregator.escrow(ctx);
        let mut recipient_escrow = ctx.escrows.get(&self.reward_recipient).unwrap();
        aggregator_escrow
            .send(ctx, &mut recipient_escrow, queue.reward.into())
            .unwrap();
        let jitter = (now_seconds() + self.jitter as u64) % 5;
        // Prevent new round opens if still no success for up to 1 minute.
        // let is_valid = aggregator.current_round.num_success >= aggregator.min_oracle_results;
        // let is_within_limit = (now_seconds() - aggregator.current_round.round_open_timestamp) < 20;
        // if !is_valid && is_within_limit {
        // aggregator.next_allowed_update_time = now_seconds()
        // .checked_add(aggregator.min_update_delay_seconds.into())
        // .ok_or(Error::IntegerOverflow)?
        // .checked_add(jitter.into())
        // .ok_or(Error::IntegerOverflow)?;
        // ctx.aggregators.insert(&self.aggregator, &aggregator);
        // return Error::AggregatorIllegalRoundOpenCall.into();
        // }
        let next_allowed_update_time = now_seconds()
            .checked_add(aggregator.min_update_delay_seconds.into())
            .ok_or(Error::IntegerOverflow)?
            .checked_add(jitter.into())
            .ok_or(Error::IntegerOverflow)?;
        aggregator.next_allowed_update_time = next_allowed_update_time;
        aggregator.apply_last_failure_check();
        let oracle_list = queue.next_n(aggregator.oracle_request_batch_size).unwrap();
        aggregator.init_new_round(&oracle_list);
        AggregatorOpenRoundEvent {
            feed_key: self.aggregator,
            oracles: oracle_list,
            jobs: aggregator.jobs.to_vec(),
        }
        .emit();
        ctx.aggregators.insert(&self.aggregator, &aggregator);
        ctx.queues.insert(&aggregator.queue, &queue);
        Ok(())
    }
}
