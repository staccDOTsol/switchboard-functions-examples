use crate::*;
use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use anchor_spl::token::Token;
use core::cell::RefCell;
use std::cmp::min;
use std::convert::TryFrom;

macro_rules! derive_history {
    ($ctx: ident, $aggregator: ident, $ret: ident) => {
        let history_buf = RefCell::<&mut [u8]>::new(&mut []);
        let mut history_buf = $ctx
            .accounts
            .history_buffer
            .try_borrow_mut_data()
            .unwrap_or(history_buf.borrow_mut());
        if *$ctx.accounts.history_buffer.key == $aggregator.history_buffer {
            $ret = Some(AggregatorAccountData::convert_buffer(*history_buf));
        }
    };
}

#[derive(Accounts)]
#[instruction(params: AggregatorSaveResultParams)] // rpc parameters hint
pub struct AggregatorSaveResult<'info> {
    #[account(mut)]
    pub aggregator: AccountLoader<'info, AggregatorAccountData>,
    #[account(mut,
        has_one = oracle_authority @ SwitchboardError::InvalidAuthorityError,
        constraint = oracle.load()?.queue_pubkey == oracle_queue.key())]
    pub oracle: AccountLoader<'info, OracleAccountData>,
    pub oracle_authority: Signer<'info>,
    #[account(constraint = oracle_queue.load()?.authority == queue_authority.key()
        @ SwitchboardError::InvalidAuthorityError)]
    pub oracle_queue: AccountLoader<'info, OracleQueueAccountData>,
    /// CHECK: todo
    pub queue_authority: AccountInfo<'info>,
    #[account(mut, seeds = [PERMISSION_SEED,
        queue_authority.key().as_ref(),
        oracle_queue.key().as_ref(),
        aggregator.key().as_ref()],
        bump = params.feed_permission_bump)]
    pub feed_permission: AccountLoader<'info, PermissionAccountData>,
    #[account(seeds = [PERMISSION_SEED,
        queue_authority.key().as_ref(),
        oracle_queue.key().as_ref(),
        oracle.key().as_ref()],
        bump = params.oracle_permission_bump)]
    pub oracle_permission: AccountLoader<'info, PermissionAccountData>,
    #[account(mut, has_one = escrow, seeds = [LEASE_SEED,
        oracle_queue.key().as_ref(),
        aggregator.key().as_ref()],
        bump = params.lease_bump)]
    pub lease: AccountLoader<'info, LeaseAccountData>,
    #[account(mut, constraint =
        escrow.mint == oracle_queue.load()?.get_mint() && escrow.owner == program_state.key())]
    pub escrow: Account<'info, TokenAccount>,
    #[account(address = anchor_spl::token::ID)]
    pub token_program: Program<'info, Token>,
    #[account(seeds = [STATE_SEED], bump = params.state_bump)]
    pub program_state: AccountLoader<'info, SbState>,
    /// CHECK: todo
    #[account(mut)]
    pub history_buffer: AccountInfo<'info>,
    #[account(address = oracle_queue.load()?.get_mint())]
    pub mint: Account<'info, Mint>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct AggregatorSaveResultParams {
    pub oracle_idx: u32,
    pub error: bool,
    pub value: BorshDecimal,
    pub jobs_checksum: [u8; 32],
    pub min_response: BorshDecimal,
    pub max_response: BorshDecimal,
    pub feed_permission_bump: u8,
    pub oracle_permission_bump: u8,
    pub lease_bump: u8,
    pub state_bump: u8,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct AggregatorSaveResultParamsV2 {
    pub oracle_idx: u32,
    pub error: bool,
    pub value: BorshDecimal,
    pub jobs_checksum: [u8; 32],
    pub min_response: BorshDecimal,
    pub max_response: BorshDecimal,
    pub feed_permission_bump: u8,
    pub oracle_permission_bump: u8,
    pub lease_bump: u8,
    pub state_bump: u8,
    pub job_values: Vec<Option<BorshDecimal>>,
}
impl<'info> AggregatorSaveResult<'info> {
    pub fn perform_payout(
        ctx: &Context<'_, '_, '_, 'info, AggregatorSaveResult<'info>>,
        params: &AggregatorSaveResultParamsV2,
        payout_wallet: &Account<'info, TokenAccount>,
        aggregator: &mut AggregatorAccountData,
        new_payout: i64,
        idx: usize,
    ) -> Result<()> {
        let undo_amount = aggregator.current_round.current_payout[idx];

        let payout: i64 = new_payout.checked_sub(undo_amount).unwrap();

        let change: i64;
        if payout >= 0 {
            let amount = min(payout.abs().try_into().unwrap(), ctx.accounts.escrow.amount);
            transfer(
                &ctx.accounts.token_program,
                &ctx.accounts.escrow,
                payout_wallet,
                &ctx.accounts.program_state.to_account_info(),
                &[&[STATE_SEED, &[params.state_bump]]],
                amount,
            )?;
            change = amount.try_into().unwrap();
        } else {
            let amount = min(payout.abs().try_into().unwrap(), payout_wallet.amount);
            transfer(
                &ctx.accounts.token_program,
                payout_wallet,
                &ctx.accounts.escrow,
                &ctx.accounts.program_state.to_account_info(),
                &[&[STATE_SEED, &[params.state_bump]]],
                amount,
            )?;
            change = i64::try_from(amount).unwrap().checked_mul(-1).unwrap();
        }
        aggregator.current_round.current_payout[idx] = aggregator.current_round.current_payout[idx]
            .checked_add(change)
            .unwrap();
        Ok(())
    }

    pub fn payout_priority_fees(
        ctx: &Ctx<'_, 'info, AggregatorSaveResult<'info>>,
        params: &AggregatorSaveResultParamsV2,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let aggregator = ctx.accounts.aggregator.load()?;
        let lease = ctx.accounts.lease.load()?;

        let fee = aggregator.calc_priority_fee(&clock);

        lease.maybe_thaw_escrow(
            &ctx.accounts.token_program,
            &ctx.accounts.escrow,
            &ctx.accounts.mint,
            &ctx.accounts.program_state.to_account_info(),
            params.state_bump,
        )?;
        let wallet_idx = (aggregator.oracle_request_batch_size + params.oracle_idx) as usize;
        let staking_wallet_account = ctx.remaining_accounts[wallet_idx].clone();
        let staking_wallet: Account<'info, TokenAccount> =
            Account::try_from(&staking_wallet_account)?;
        if staking_wallet.key() != ctx.accounts.oracle.load()?.token_account {
            return Err(error!(SwitchboardError::OracleMismatchError));
        }
        transfer(
            &ctx.accounts.token_program,
            &ctx.accounts.escrow,
            &staking_wallet,
            &ctx.accounts.program_state.to_account_info(),
            &[&[STATE_SEED, &[params.state_bump]]],
            fee,
        )?;
        emit!(PriorityFeeReimburseEvent {
            feed_pubkey: ctx.accounts.aggregator.key(),
            slot: clock.slot,
            timestamp: clock.unix_timestamp,
            fee,
        });
        lease.maybe_freeze_escrow(
            &ctx.accounts.token_program,
            &ctx.accounts.escrow,
            &ctx.accounts.mint,
            &ctx.accounts.program_state.to_account_info(),
            params.state_bump,
        )?;
        Ok(())
    }

    pub fn validate(
        &self,
        ctx: &Ctx<'_, 'info, AggregatorSaveResult<'info>>,
        params: &AggregatorSaveResultParamsV2,
    ) -> Result<()> {
        let aggregator = ctx.accounts.aggregator.load()?;
        let current_round = aggregator.current_round;
        if aggregator.job_pubkeys_size == 0 {
            return Err(error!(SwitchboardError::NoAggregatorJobsFound));
        }
        if !(ctx.accounts.oracle_permission.load()?.permissions
            & SwitchboardPermission::PermitOracleHeartbeat)
        {
            return Err(error!(SwitchboardError::PermissionDenied));
        }
        if params.oracle_idx >= aggregator.oracle_request_batch_size {
            return Err(error!(SwitchboardError::ArrayOverflowError));
        }
        let oracle_key = ctx.accounts.oracle.key();
        if aggregator.current_round.oracle_pubkeys_data[params.oracle_idx as usize] != oracle_key {
            return Err(error!(SwitchboardError::OracleMismatchError));
        }
        let wallet_idx = (aggregator.oracle_request_batch_size + params.oracle_idx) as usize;
        let staking_wallet_account = ctx.remaining_accounts[wallet_idx].clone();
        if *staking_wallet_account.key != ctx.accounts.oracle.load()?.token_account {
            return Err(error!(SwitchboardError::OracleWalletMismatchError));
        }
        let staking_wallet: Account<'info, TokenAccount> =
            Account::try_from(&staking_wallet_account)?;
        if staking_wallet.amount < ctx.accounts.oracle_queue.load()?.min_stake {
            return Err(error!(SwitchboardError::InsufficientStakeError));
        }
        if current_round.medians_fulfilled[params.oracle_idx as usize] {
            return Err(error!(SwitchboardError::OracleAlreadyRespondedError));
        }
        if current_round.errors_fulfilled[params.oracle_idx as usize] {
            return Err(error!(SwitchboardError::OracleAlreadyRespondedError));
        }
        // Check reported job checksum in case an oracle is using a malicious
        // RPC node, misreporting which jobs to perform.
        if params.jobs_checksum != aggregator.jobs_checksum {
            return Err(error!(SwitchboardError::AggregatorJobChecksumMismatch));
        }
        let history_buffer = *ctx.accounts.history_buffer.key;
        // To reduce locking issues, history buffer is set to the aggregator account if not set.
        if history_buffer != ctx.accounts.aggregator.key()
            && history_buffer != aggregator.history_buffer
        {
            return Err(error!(SwitchboardError::InvalideHistoryAccountError));
        }
        if history_buffer == aggregator.history_buffer {
            assert_buffer_account(ctx.program_id, &ctx.accounts.history_buffer)?;
        }
        let queue = ctx.accounts.oracle_queue.load()?;
        if queue.enable_tee_only {
            return Err(error!(SwitchboardError::PermissionDenied));
        }

        Ok(())
    }

    pub fn actuate(
        ctx: &Ctx<'_, 'info, AggregatorSaveResult<'info>>,
        params: &AggregatorSaveResultParamsV2,
    ) -> Result<()> {
        Self::payout_priority_fees(ctx, params)?;
        let mut aggregator = ctx.accounts.aggregator.load_mut()?;
        let mut feed_permission = ctx.accounts.feed_permission.load_mut()?;
        let lease = ctx.accounts.lease.load()?;
        let clock = Clock::get()?;
        let queue = ctx.accounts.oracle_queue.load()?;
        emit!(AggregatorSaveResultEvent {
            feed_pubkey: ctx.accounts.aggregator.key(),
            value: params.value,
            slot: clock.slot,
            timestamp: clock.unix_timestamp,
            oracle_pubkey: ctx.accounts.oracle.key(),
            job_values: params.job_values.clone(),
        });
        //
        msg!("P1 {:?}", ctx.accounts.aggregator.key());
        if aggregator.resolution_mode == AggregatorResolutionMode::ModeSlidingResolution {
            msg!("MODE_SLIDING");
        } else {
            msg!("MODE_ROUND");
        }
        if params.error {
            aggregator.apply_oracle_error(params);
            if aggregator.current_error_count() >= aggregator.min_oracle_results
                && lease.update_count < queue.feed_probation_period.into()
            {
                // Disable the permission if the probation invariant is broken.
                feed_permission.permissions &=
                    !(SwitchboardPermission::PermitOracleQueueUsage as u32);
                emit!(ProbationBrokenEvent {
                    feed_pubkey: ctx.accounts.aggregator.key(),
                    queue_pubkey: ctx.accounts.oracle_queue.key(),
                    timestamp: clock.unix_timestamp,
                });
            }
        } else {
            // TODO: DO PAYMENT HERE
            if aggregator.resolution_mode == AggregatorResolutionMode::ModeSlidingResolution {
                let slide_idx = aggregator.oracle_request_batch_size as usize * 2;
                let sliding_result_account_info = &ctx.remaining_accounts[slide_idx];
                let slider_loader = AccountLoader::<'_, SlidingResultAccountData>::try_from(
                    &sliding_result_account_info.clone(),
                )?;
                let mut slider = slider_loader.load_mut()?;
                let correct_key = SlidingResultAccountData::key_from_seed(
                    ctx.program_id,
                    &ctx.accounts.aggregator.key(),
                    slider.bump,
                )?;
                if sliding_result_account_info.key() != correct_key {
                    return Err(error!(SwitchboardError::InvalidSliderAccount));
                }
                let wallet_idx =
                    (aggregator.oracle_request_batch_size + params.oracle_idx) as usize;
                let staking_wallet_account = ctx.remaining_accounts[wallet_idx].clone();
                let staking_wallet: Account<'info, TokenAccount> =
                    Account::try_from(&staking_wallet_account)?;
                slider.push(
                    ctx.accounts.oracle.key(),
                    params.value.into(),
                    aggregator.oracle_request_batch_size,
                )?;
                let new_result = slider.get_value(aggregator.oracle_request_batch_size)?;
                aggregator.latest_confirmed_round = AggregatorRound::from_vec(
                    slider.get_values(aggregator.oracle_request_batch_size),
                    clock.slot,
                    clock.unix_timestamp,
                )?;
                emit!(AggregatorValueUpdateEvent {
                    feed_pubkey: ctx.accounts.aggregator.key(),
                    value: new_result.value.into(),
                    slot: new_result.slot,
                    timestamp: new_result.timestamp,
                    oracle_pubkeys: vec![new_result.oracle_key],
                    oracle_values: vec![new_result.value.into()],
                });
                let amount = min(queue.reward, ctx.accounts.escrow.amount);
                msg!("Reward: {}", amount);
                transfer(
                    &ctx.accounts.token_program,
                    &ctx.accounts.escrow,
                    &staking_wallet,
                    &ctx.accounts.program_state.to_account_info(),
                    &[&[STATE_SEED, &[params.state_bump]]],
                    amount,
                )?;
            }
            // History buffer parsing
            let mut history_account_info = None;
            derive_history!(ctx, aggregator, history_account_info);
            aggregator.apply_oracle_result(params, history_account_info, clock.unix_timestamp)?;
        }
        // Only track metrics if round closure was a success.
        // ie if we could close a round, its probably a feed problem, not an
        // oracle problem.
        if aggregator.current_round.num_success >= aggregator.min_oracle_results
            && aggregator.resolution_mode == AggregatorResolutionMode::ModeRoundResolution
        {
            // History buffer parsing
            let mut history_account_info = None;
            derive_history!(ctx, aggregator, history_account_info);
            aggregator.update_latest_value(history_account_info)?;
            // Only apply reputation updates on first round closure.
            let apply_rep_updates =
                aggregator.current_round.num_success == aggregator.min_oracle_results;
            let median: Decimal = aggregator.current_round.result.try_into()?;
            let mutliplier: Decimal = queue.variance_tolerance_multiplier.try_into()?;
            let std_dev: Decimal = aggregator.current_round.std_deviation.try_into()?;
            let threshold = std_dev.checked_mul(mutliplier).unwrap();
            let upper_threshold = median.checked_add(threshold).unwrap();
            let lower_threshold = median.checked_sub(threshold).unwrap();
            let wallet_start_idx = aggregator.oracle_request_batch_size as usize;
            let mut oracle_success_pubkeys =
                Vec::with_capacity(aggregator.current_round.num_success.try_into().unwrap());
            let mut medians =
                Vec::with_capacity(aggregator.current_round.num_success.try_into().unwrap());
            lease.maybe_thaw_escrow(
                &ctx.accounts.token_program,
                &ctx.accounts.escrow,
                &ctx.accounts.mint,
                &ctx.accounts.program_state.to_account_info(),
                params.state_bump,
            )?;
            for idx in 0..aggregator.oracle_request_batch_size {
                let idx = idx as usize;
                let oracle_result: Decimal =
                    aggregator.current_round.medians_data[idx].try_into()?;
                let payout_wallet_account = ctx.remaining_accounts[wallet_start_idx + idx].clone();
                let payout_wallet = Account::try_from(&payout_wallet_account.clone())?;
                let oracle_account = &ctx.remaining_accounts[idx];
                let oracle =
                    AccountLoader::<'_, OracleAccountData>::try_from(&oracle_account.clone())?;
                let mut oracle = oracle.load_mut()?;
                if *ctx.remaining_accounts[idx].key
                    != aggregator.current_round.oracle_pubkeys_data[idx]
                {
                    return Err(error!(SwitchboardError::OracleMismatchError));
                }
                if *payout_wallet_account.key != oracle.token_account {
                    return Err(error!(SwitchboardError::OracleMismatchError));
                }
                // Enter payouts & slash block

                // CASE: ERROR REPORTED
                if aggregator.current_round.errors_fulfilled[idx] {
                    let payout = 0;
                    // TODO: DO PAYMENT HERE. pay in non-sliding window mode`
                    Self::perform_payout(
                        ctx,
                        params,
                        &payout_wallet,
                        &mut aggregator,
                        payout,
                        idx,
                    )?;
                    if apply_rep_updates {
                        oracle.update_reputation(OracleResponseType::TypeError);
                    }
                    continue;
                }
                // CASE: NO RESPONSE
                if !aggregator.current_round.medians_fulfilled[idx] {
                    if apply_rep_updates {
                        oracle.update_reputation(OracleResponseType::TypeNoResponse);
                    }
                    let mut slash = 0i64.saturating_sub(queue.reward.try_into().unwrap());
                    if !queue.slashing_enabled {
                        slash = 0;
                    }
                    //SLASH. Send payment to lease escrow
                    Self::perform_payout(ctx, params, &payout_wallet, &mut aggregator, slash, idx)?;
                    emit!(OracleSlashEvent {
                        feed_pubkey: ctx.accounts.aggregator.key(),
                        lease_pubkey: ctx.accounts.lease.key(),
                        oracle_pubkey: oracle_account.key(),
                        wallet_pubkey: payout_wallet.key(),
                        amount: slash.abs().try_into().unwrap(),
                        round_slot: aggregator.current_round.round_open_slot,
                        timestamp: clock.unix_timestamp,
                    });
                    continue;
                }
                oracle_success_pubkeys.push(oracle_account.key());
                medians.push(aggregator.current_round.medians_data[idx].into());
                // CASE: RESPONSE WITHIN THRESHOLD
                if oracle_result <= upper_threshold && oracle_result >= lower_threshold {
                    if apply_rep_updates {
                        oracle.update_reputation(OracleResponseType::TypeSuccess);
                    }
                    let reward: i64 = queue.reward.try_into().unwrap();
                    Self::perform_payout(
                        ctx,
                        params,
                        &payout_wallet,
                        &mut aggregator,
                        reward,
                        idx,
                    )?;
                    emit!(OracleRewardEvent {
                        feed_pubkey: ctx.accounts.aggregator.key(),
                        lease_pubkey: ctx.accounts.lease.key(),
                        oracle_pubkey: oracle_account.key(),
                        wallet_pubkey: payout_wallet.key(),
                        amount: reward.try_into().unwrap(),
                        round_slot: aggregator.current_round.round_open_slot,
                        timestamp: clock.unix_timestamp,
                    });
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
                    Self::perform_payout(ctx, params, &payout_wallet, &mut aggregator, slash, idx)?;
                    emit!(OracleSlashEvent {
                        feed_pubkey: ctx.accounts.aggregator.key(),
                        lease_pubkey: ctx.accounts.lease.key(),
                        oracle_pubkey: oracle_account.key(),
                        wallet_pubkey: payout_wallet.key(),
                        amount: slash.abs().try_into().unwrap(),
                        round_slot: aggregator.current_round.round_open_slot,
                        timestamp: clock.unix_timestamp,
                    });
                }
            }
            lease.maybe_freeze_escrow(
                &ctx.accounts.token_program,
                &ctx.accounts.escrow,
                &ctx.accounts.mint,
                &ctx.accounts.program_state.to_account_info(),
                params.state_bump,
            )?;
            // TODO: evaluation revoking oracle based on current reputation
            if aggregator.resolution_mode == AggregatorResolutionMode::ModeRoundResolution {
                emit!(AggregatorValueUpdateEvent {
                    feed_pubkey: ctx.accounts.aggregator.key(),
                    value: aggregator.latest_confirmed_round.result.into(),
                    slot: clock.slot,
                    timestamp: clock.unix_timestamp,
                    oracle_pubkeys: oracle_success_pubkeys,
                    oracle_values: medians,
                });
            }
        }
        Ok(())
    }
}
