use crate::error::Error;
use crate::*;
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::serde::{Deserialize, Serialize};
use rust_decimal::Decimal;
use std::cmp::min;
use std::convert::TryFrom;
use std::convert::TryInto;
use std::vec::Vec;

#[derive(Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
pub struct AggregatorSaveResult {
    pub aggregator_key: Uuid,
    pub oracle_idx: u32,
    pub error: bool,
    pub value: JsonDecimal,
    pub jobs_checksum: [u8; 32],
    pub min_response: JsonDecimal,
    pub max_response: JsonDecimal,
}
impl AggregatorSaveResult {
    fn perform_payout(
        ctx: &mut Contract,
        aggregator: &mut Aggregator,
        aggregator_escrow: &mut Escrow,
        oracle_escrow: &mut Escrow,
        new_payout: i64,
        idx: usize,
    ) -> Result<(), Error> {
        let undo_amount = aggregator.current_round.current_payout[idx];

        let payout: i64 = new_payout.checked_sub(undo_amount).unwrap();

        let change: i64;
        if payout >= 0 {
            let amount = min(
                payout.abs().try_into().unwrap(),
                aggregator_escrow.available_amount(),
            );
            aggregator_escrow.send(ctx, oracle_escrow, amount)?;
            change = amount.try_into().unwrap();
        } else {
            let amount = min(
                payout.abs().try_into().unwrap(),
                oracle_escrow.available_amount(),
            );
            oracle_escrow.send(ctx, aggregator_escrow, amount)?;
            change = i64::try_from(amount).unwrap().checked_mul(-1).unwrap();
        }
        aggregator.current_round.current_payout[idx] = aggregator.current_round.current_payout[idx]
            .checked_add(change)
            .unwrap();
        Ok(())
    }
}

impl Action for AggregatorSaveResult {
    fn validate(&self, ctx: &Contract) -> Result<(), Error> {
        let aggregator = ctx
            .aggregators
            .get(&self.aggregator_key)
            .ok_or(Error::InvalidAggregator)?;
        let queue = ctx
            .queues
            .get(&aggregator.queue)
            .ok_or(Error::InvalidQueue)?;
        // if aggregator.jobs.len() == 0 {
        // return Error::NoAggregatorJobsFound.into();
        // }
        let current_round = &aggregator.current_round;
        let oracle: Oracle = ctx
            .oracles
            .get(&current_round.oracles[self.oracle_idx as usize])
            .ok_or(Error::InvalidOracle)?;
        let permission = Permission::get(ctx, &queue.authority, &aggregator.queue, &oracle.address)
            .ok_or(Error::InvalidPermission)?;
        require(
            permission.has(SwitchboardPermission::PermitOracleHeartbeat),
            Error::PermissionDenied,
        )?;
        require(
            self.oracle_idx < aggregator.oracle_request_batch_size,
            Error::ArrayOverflow,
        )?;
        assert_authorized(&oracle)?;
        let oracle_escrow = oracle.escrow(ctx);
        if queue.min_stake > 0
            && oracle_escrow.available_amount()
                < queue
                    .max_round_rewards(aggregator.oracle_request_batch_size)
                    .into()
        {
            return Error::InsufficientStake.into();
        }
        // TODO: ADD TOTOAL STAKE CHECK. check sol impl too
        require(
            !current_round.medians_fulfilled[self.oracle_idx as usize],
            Error::OracleAlreadyResponded,
        )?;
        require(
            !current_round.errors_fulfilled[self.oracle_idx as usize],
            Error::OracleAlreadyResponded,
        )?;
        
        // Check reported job checksum in case an oracle is using a malicious
        // RPC node, misreporting which jobs to perform.
        require(
            self.jobs_checksum == aggregator.jobs_checksum[..],
            Error::JobChecksumMismatch,
        )?;
        Ok(())
    }

    fn actuate(&self, ctx: &mut Contract) -> Result<(), Error> {
        let mut aggregator = ctx.aggregators.get(&self.aggregator_key).unwrap();
        let mut aggregator_escrow = aggregator.escrow(ctx);
        let queue = ctx.queues.get(&aggregator.queue).unwrap();
        if self.error {
            aggregator.apply_oracle_error(&self);
            // if aggregator.current_error_count() >= aggregator.min_oracle_results
            // // && lease.update_count < queue.feed_probation_period.into()
            // {
            // // Disable the permission if the probation invariant is broken.
            // feed_permission.permissions &=
            // !(SwitchboardPermission::PermitOracleQueueUsage as u32);
            // emit!(ProbationBrokenEvent {
            // feed_key: ctx.accounts.aggregator.key(),
            // queue_key: ctx.accounts.oracle_queue.key(),
            // timestamp: clock.unix_timestamp,
            // });
            // }
        } else {
            aggregator.apply_oracle_result(&self)?;
        }
        // Only track metrics if round closure was a success.
        // ie if we could close a round, its probably a feed problem, not an
        // oracle problem.
        if aggregator.current_round.num_success >= aggregator.min_oracle_results {
            aggregator.update_latest_value()?;
            // Only apply reputation updates on first round closure.
            let apply_rep_updates =
                aggregator.current_round.num_success == aggregator.min_oracle_results;
            let median: Decimal = aggregator.current_round.result.try_into()?;
            let mutliplier: Decimal = queue.variance_tolerance_multiplier.try_into()?;
            let std_dev: Decimal = aggregator.current_round.std_deviation.try_into()?;
            let threshold = std_dev.checked_mul(mutliplier).unwrap();
            let upper_threshold = median.checked_add(threshold).unwrap();
            let lower_threshold = median.checked_sub(threshold).unwrap();
            let mut oracle_success_keys =
                Vec::with_capacity(aggregator.current_round.num_success.try_into().unwrap());
            let mut medians: Vec<SwitchboardDecimal> =
                Vec::with_capacity(aggregator.current_round.num_success.try_into().unwrap());
            for idx in 0..aggregator.oracle_request_batch_size {
                let idx = idx as usize;
                let oracle_key = aggregator.current_round.oracles[idx];
                let mut oracle = ctx.oracles.get(&oracle_key).ok_or(Error::InvalidOracle)?;
                let mut oracle_escrow = oracle.escrow(ctx);
                let oracle_result: Decimal =
                    aggregator.current_round.medians_data[idx].try_into()?;
                // Enter payouts & slash block

                // CASE: ERROR REPORTED
                if aggregator.current_round.errors_fulfilled[idx] == true {
                    let payout = 0;
                    Self::perform_payout(
                        ctx,
                        &mut aggregator,
                        &mut aggregator_escrow,
                        &mut oracle_escrow,
                        payout,
                        idx,
                    )?;
                    if apply_rep_updates {
                        oracle.update_reputation(OracleResponseType::TypeError);
                    }
                    ctx.oracles.insert(&oracle_key, &oracle);
                    continue;
                }
                // CASE: NO RESPONSE
                if aggregator.current_round.medians_fulfilled[idx] == false {
                    if apply_rep_updates {
                        oracle.update_reputation(OracleResponseType::TypeNoResponse);
                    }
                    let mut slash = 0i64.saturating_sub(queue.reward.try_into().unwrap());
                    if !queue.slashing_enabled {
                        slash = 0;
                    }
                    //SLASH. Send payment to lease escrow
                    Self::perform_payout(
                        ctx,
                        &mut aggregator,
                        &mut aggregator_escrow,
                        &mut oracle_escrow,
                        slash,
                        idx,
                    )?;
                    OracleSlashEvent {
                        feed: aggregator.address,
                        oracle: oracle.address,
                        amount: slash.abs().try_into().unwrap(),
                        round_id: aggregator.current_round.id,
                        timestamp: now_seconds(),
                    }
                    .emit();
                    ctx.oracles.insert(&oracle_key, &oracle);
                    continue;
                }
                oracle_success_keys.push(oracle_key);
                medians.push(aggregator.current_round.medians_data[idx].into());
                // CASE: RESPONSE WITHIN THRESHOLD
                if oracle_result <= upper_threshold && oracle_result >= lower_threshold {
                    if apply_rep_updates {
                        oracle.update_reputation(OracleResponseType::TypeSuccess);
                    }
                    let reward: i64 = queue.reward.try_into().unwrap();
                    Self::perform_payout(
                        ctx,
                        &mut aggregator,
                        &mut aggregator_escrow,
                        &mut oracle_escrow,
                        reward,
                        idx,
                    )?;
                    OracleRewardEvent {
                        feed_key: aggregator.address,
                        oracle_key: oracle.address,
                        amount: reward.try_into().unwrap(),
                        round_id: aggregator.current_round.id,
                        timestamp: now_seconds(),
                    }
                    .emit();
                    // CASE: RESPONSE OUTSIDE THRESHOLD
                } else {
                    if apply_rep_updates {
                        oracle.update_reputation(OracleResponseType::TypeDisagreement);
                    }
                    let mut slash = 0i64.saturating_sub(queue.reward.try_into().unwrap());
                    if !queue.slashing_enabled {
                        slash = 0;
                    }
                    //SLASH. Send payment to lease escrow
                    Self::perform_payout(
                        ctx,
                        &mut aggregator,
                        &mut aggregator_escrow,
                        &mut oracle_escrow,
                        slash,
                        idx,
                    )?;
                    OracleSlashEvent {
                        feed: aggregator.address,
                        oracle: oracle.address,
                        amount: slash.abs().try_into().unwrap(),
                        round_id: aggregator.current_round.id,
                        timestamp: now_seconds(),
                    }
                    .emit();
                }
                ctx.oracles.insert(&oracle_key, &oracle);
            }
            AggregatorValueUpdateEvent {
                feed_key: self.aggregator_key,
                value: aggregator.latest_confirmed_round.result.into(),
                round_id: aggregator.latest_confirmed_round.id,
                timestamp: now_seconds(),
                oracles: oracle_success_keys,
                oracle_values: medians,
            }
            .emit();
        }
        ctx.aggregators.insert(&self.aggregator_key, &aggregator);
        Ok(())
    }
}
