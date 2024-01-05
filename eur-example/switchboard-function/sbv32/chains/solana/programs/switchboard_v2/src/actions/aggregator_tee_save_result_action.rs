use crate::*;
use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use anchor_spl::token::Token;
use core::cell::RefCell;

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

pub fn find_account<'a>(
    ctx: &Ctx<'_, 'a, AggregatorTeeSaveResult<'a>>,
    key: &Pubkey,
) -> Result<AccountInfo<'a>> {
    let idx = ctx
        .remaining_accounts
        .binary_search_by(|acc_info| acc_info.key.cmp(key))
        .map_err(|_| SwitchboardError::MissingOptionalAccount)?;
    Ok(ctx.remaining_accounts[idx].clone())
}

#[derive(Accounts)]
#[instruction(params: AggregatorTeeSaveResultParams)] // rpc parameters hint
pub struct AggregatorTeeSaveResult<'info> {
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
        oracle_authority.key().as_ref()],
        bump = params.oracle_permission_bump)]
    pub oracle_permission: AccountLoader<'info, PermissionAccountData>,
    #[account(mut, has_one = escrow, seeds = [LEASE_SEED,
        oracle_queue.key().as_ref(),
        aggregator.key().as_ref()],
        bump = params.lease_bump)]
    pub lease: AccountLoader<'info, LeaseAccountData>,
    #[account(mut, constraint =
        escrow.mint == oracle_queue.load()?.get_mint() && escrow.owner == program_state.key())]
    pub escrow: Box<Account<'info, TokenAccount>>,
    #[account(address = anchor_spl::token::ID)]
    pub token_program: Program<'info, Token>,
    #[account(seeds = [STATE_SEED], bump = params.state_bump)]
    pub program_state: AccountLoader<'info, SbState>,
    /// CHECK: todo
    #[account(mut)]
    pub history_buffer: AccountInfo<'info>,
    #[account(address = oracle_queue.load()?.get_mint())]
    pub mint: Account<'info, Mint>,
    // TODO: oracles shouldnt really pay for this.
    #[account(init_if_needed, seeds = [SLIDING_RESULT_SEED,
        aggregator.key().as_ref()],
        payer = payer,
        space = std::mem::size_of::<SlidingResultAccountData>() + 8,
        bump)]
    pub slider: AccountLoader<'info, SlidingResultAccountData>,
    // TODO:
    // pub callback: AccountInfo<'info>,
    // TODO
    pub quote: Signer<'info>,
    #[account(mut, constraint = escrow.mint == oracle_queue.load()?.get_mint())]
    pub reward_wallet: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(address = solana_program::system_program::ID)]
    pub system_program: Program<'info, System>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct AggregatorTeeSaveResultParams {
    pub value: BorshDecimal,
    pub jobs_checksum: [u8; 32],
    pub min_response: BorshDecimal,
    pub max_response: BorshDecimal,
    pub feed_permission_bump: u8,
    pub oracle_permission_bump: u8,
    pub lease_bump: u8,
    pub state_bump: u8,
}
impl<'info> AggregatorTeeSaveResult<'info> {
    pub fn payout_priority_fees(
        ctx: &Ctx<'_, 'info, AggregatorTeeSaveResult<'info>>,
        params: &AggregatorTeeSaveResultParams,
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
        transfer(
            &ctx.accounts.token_program,
            &ctx.accounts.escrow,
            &ctx.accounts.reward_wallet,
            &ctx.accounts.program_state.to_account_info(),
            &[&[STATE_SEED, &[params.state_bump]]],
            fee,
        )?;
        lease.maybe_freeze_escrow(
            &ctx.accounts.token_program,
            &ctx.accounts.escrow,
            &ctx.accounts.mint,
            &ctx.accounts.program_state.to_account_info(),
            params.state_bump,
        )?;
        emit!(PriorityFeeReimburseEvent {
            feed_pubkey: ctx.accounts.aggregator.key(),
            slot: clock.slot,
            timestamp: clock.unix_timestamp,
            fee,
        });
        Ok(())
    }

    pub fn validate(
        ctx: &Ctx<'_, 'info, AggregatorTeeSaveResult<'info>>,
        params: AggregatorTeeSaveResultParams,
    ) -> Result<()> {
        let state = ctx.accounts.program_state.load()?;
        let aggregator = ctx.accounts.aggregator.load()?;
        let oracle = ctx.accounts.oracle.load()?;
        let quote_account_info = &ctx.accounts.quote;
        VerifierAccountData::validate_quote(
            quote_account_info,
            &ctx.accounts.oracle.key(),
            &Clock::get()?,
        )?;
        let data = ctx.accounts.quote.try_borrow_data()?;
        let quote = VerifierAccountData::load(ctx.accounts.quote.owner, data)?;
        // let parsed_quote = quote.parsed()?;
        if !state.mr_enclaves.contains(&quote.enclave.mr_enclave) {
            return Err(error!(SwitchboardError::GenericError));
        }
        if aggregator.resolution_mode != AggregatorResolutionMode::ModeSlidingResolution {
            return Err(error!(SwitchboardError::PermissionDenied));
        }
        if !(ctx.accounts.oracle_permission.load()?.permissions
            & SwitchboardPermission::PermitOracleHeartbeat)
        {
            return Err(error!(SwitchboardError::PermissionDenied));
        }
        if ctx.accounts.oracle_authority.key() != ctx.accounts.quote.key() {
            return Err(error!(SwitchboardError::PermissionDenied));
        }
        if aggregator.job_pubkeys_size == 0 {
            return Err(error!(SwitchboardError::NoAggregatorJobsFound));
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
            return Err(error!(SwitchboardError::InvalidHistoryAccountError));
        }
        if history_buffer == aggregator.history_buffer {
            assert_buffer_account(ctx.program_id, &ctx.accounts.history_buffer)?;
        }
        VerifierAccountData::validate_quote(
            &ctx.accounts.quote,
            &ctx.accounts.oracle.key(),
            &Clock::get()?,
        )?;
        Ok(())
    }

    pub fn actuate(
        ctx: &Ctx<'_, 'info, AggregatorTeeSaveResult<'info>>,
        params: &AggregatorTeeSaveResultParams,
    ) -> Result<()> {
        Self::payout_priority_fees(ctx, params)?;
        let mut aggregator = ctx.accounts.aggregator.load_mut()?;
        let lease = ctx.accounts.lease.load()?;
        let clock = Clock::get()?;
        let queue = ctx.accounts.oracle_queue.load()?;
        let mut slider = ctx.accounts.slider.load_mut();
        if slider.is_err() {
            slider = ctx.accounts.slider.load_init();
        }
        let mut slider = slider?;
        let reward: i64 = queue.reward.try_into().unwrap();
        let reward_wallet = &ctx.accounts.reward_wallet;
        let mut history_account_info = None;
        derive_history!(ctx, aggregator, history_account_info);

        // TODO: CAREFUL AUTO SWITCHING MODES, would just have 1 value to start
        aggregator.resolution_mode = AggregatorResolutionMode::ModeSlidingResolution;
        slider.bump = *ctx.bumps.get("slider").unwrap();
        slider.push(
            ctx.accounts.oracle.key(),
            params.value.into(),
            aggregator.oracle_request_batch_size,
        )?;
        aggregator.latest_confirmed_round = AggregatorRound::from_vec(
            slider.get_values(aggregator.oracle_request_batch_size),
            clock.slot,
            clock.unix_timestamp,
        )?;

        aggregator.apply_tee_oracle_result(
            params,
            &ctx.accounts.oracle.key(),
            history_account_info,
            clock.unix_timestamp,
        )?;
        let reward = std::cmp::min(reward.try_into().unwrap(), ctx.accounts.escrow.amount);
        lease.maybe_thaw_escrow(
            &ctx.accounts.token_program,
            &ctx.accounts.escrow,
            &ctx.accounts.mint,
            &ctx.accounts.program_state.to_account_info(),
            params.state_bump,
        )?;
        transfer(
            &ctx.accounts.token_program,
            &ctx.accounts.escrow,
            reward_wallet,
            &ctx.accounts.program_state.to_account_info(),
            &[&[STATE_SEED, &[params.state_bump]]],
            reward,
        )?;
        lease.maybe_freeze_escrow(
            &ctx.accounts.token_program,
            &ctx.accounts.escrow,
            &ctx.accounts.mint,
            &ctx.accounts.program_state.to_account_info(),
            params.state_bump,
        )?;
        emit!(AggregatorTeeSaveResultEvent {
            feed_pubkey: ctx.accounts.aggregator.key(),
            value: params.value,
            slot: clock.slot,
            timestamp: clock.unix_timestamp,
            oracle_pubkey: ctx.accounts.oracle.key(),
        });
        Ok(())
    }
}
