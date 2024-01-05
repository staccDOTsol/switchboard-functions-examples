use crate::*;

use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

#[derive(Accounts)]
#[instruction(params: AggregatorOpenRoundParams)] // rpc parameters hint
pub struct AggregatorOpenRound<'info> {
    #[account(mut)]
    pub aggregator: AccountLoader<'info, AggregatorAccountData>,
    #[account(mut, has_one = escrow, constraint =
        aggregator.key() == lease.load()?.aggregator &&
        oracle_queue.key() == lease.load()?.queue)]
    pub lease: AccountLoader<'info, LeaseAccountData>,
    #[account(mut, has_one = data_buffer)]
    pub oracle_queue: AccountLoader<'info, OracleQueueAccountData>,
    /// CHECK: todo
    #[account(constraint = oracle_queue.load()?.authority == queue_authority.key()
         @ SwitchboardError::InvalidAuthorityError)]
    pub queue_authority: AccountInfo<'info>,
    #[account(mut, seeds = [PERMISSION_SEED,
        queue_authority.key().as_ref(),
        oracle_queue.key().as_ref(),
        aggregator.key().as_ref()],
        bump = params.permission_bump)]
    pub permission: AccountLoader<'info, PermissionAccountData>,
    #[account(mut, constraint =
        escrow.mint == oracle_queue.load()?.get_mint() && escrow.owner == program_state.key())]
    pub escrow: Account<'info, TokenAccount>,
    #[account(seeds = [STATE_SEED], bump = params.state_bump)]
    pub program_state: AccountLoader<'info, SbState>,
    #[account(mut, constraint = payout_wallet.mint == oracle_queue.load()?.get_mint())]
    pub payout_wallet: Account<'info, TokenAccount>,
    #[account(address = anchor_spl::token::ID)]
    pub token_program: Program<'info, Token>,
    /// CHECK: todo
    pub data_buffer: AccountInfo<'info>,
    #[account(address = oracle_queue.load()?.get_mint())]
    pub mint: Account<'info, Mint>,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct AggregatorOpenRoundParams {
    pub state_bump: u8,
    pub lease_bump: u8,
    pub permission_bump: u8,
    pub jitter: u8,
}
impl<'a> AggregatorOpenRound<'a> {
    pub fn validate(&self, ctx: &Context<Self>, _params: &AggregatorOpenRoundParams) -> Result<()> {
        let aggregator = ctx.accounts.aggregator.load()?;
        let permission = ctx.accounts.permission.load()?;
        let queue = ctx.accounts.oracle_queue.load()?;
        let clock = Clock::get()?;
        if aggregator.queue_pubkey != ctx.accounts.oracle_queue.key() {
            return Err(error!(SwitchboardError::OracleQueueMismatch));
        }
        if aggregator.expiration != 0 && aggregator.expiration < clock.unix_timestamp {
            return Err(error!(SwitchboardError::PermissionDenied));
        }
        if aggregator.job_pubkeys_size == 0 {
            return Err(error!(SwitchboardError::NoAggregatorJobsFound));
        }
        if !queue.unpermissioned_feeds_enabled
            && !(permission.permissions & SwitchboardPermission::PermitOracleQueueUsage)
        {
            return Err(error!(SwitchboardError::PermissionDenied));
        }
        // shouldnt be necessary but fine
        if clock.unix_timestamp < aggregator.start_after {
            return Err(error!(SwitchboardError::PermissionDenied));
        }
        let escrow = &ctx.accounts.escrow;
        let queue = ctx.accounts.oracle_queue.load()?;
        // Check that the lease has enough to pay out the oracles + crank turner
        let mut lease = ctx.accounts.lease.load_mut()?;
        if !lease.is_active
            || escrow.amount < queue.max_round_rewards(aggregator.oracle_request_batch_size)
        {
            msg!("Illegal round open call initiated");
            lease.is_active = false;
            return Err(error!(SwitchboardError::AggregatorLeaseInsufficientFunds));
        }
        assert_buffer_account(ctx.program_id, &ctx.accounts.data_buffer)?;
        Ok(())
    }

    pub fn actuate(
        ctx: &Context<AggregatorOpenRound>,
        params: &AggregatorOpenRoundParams,
    ) -> Result<()> {
        let mut queue = ctx.accounts.oracle_queue.load_mut()?;
        let mut aggregator = ctx.accounts.aggregator.load_mut()?;
        let mut buf = ctx.accounts.data_buffer.try_borrow_mut_data()?;
        let buf = OracleQueueAccountData::convert_buffer(*buf);
        let clock = Clock::get()?;
        // Add jitter to next update time.
        let jitter: u32 = (clock.unix_timestamp + params.jitter as i64) as u32 % 5;
        // Prevent new round opens if still no success for up to 1 minute.
        if aggregator.active_round(Clock::get()?.unix_timestamp) {
            aggregator.next_allowed_update_time = clock
                .unix_timestamp
                .checked_add(10)
                .ok_or(error!(SwitchboardError::IntegerOverflowError))?
                .checked_add(jitter.into())
                .ok_or(error!(SwitchboardError::IntegerOverflowError))?;
            msg!("Aggregator round still not completed within minute of round open.");
            return Err(error!(SwitchboardError::AggregatorIllegalRoundOpenCall));
        }

        if clock.unix_timestamp < aggregator.next_allowed_update_time {
            return Err(error!(SwitchboardError::AggregatorIllegalRoundOpenCall));
        }
        let next_allowed_update_time = clock
            .unix_timestamp
            .checked_add(aggregator.min_update_delay_seconds.into())
            .ok_or(error!(SwitchboardError::IntegerOverflowError))?
            .checked_add(jitter.into())
            .ok_or(error!(SwitchboardError::IntegerOverflowError))?;
        aggregator.next_allowed_update_time = next_allowed_update_time;
        aggregator.apply_last_failure_check();
        // let _failure_limit = queue.consecutive_feed_failure_limit;
        // TODO(mgild): this policy currently breaks crank
        // if failure_limit != 0 && aggregator.consecutive_failure_count >= failure_limit {
        // permission.permissions &= !(SwitchboardPermission::PermitOracleQueueUsage as u32);
        // emit!(FeedPermissionRevokedEvent {
        // feed_pubkey: ctx.accounts.aggregator.key(),
        // timestamp: clock.unix_timestamp,
        // });
        // return Ok(());
        // }
        // TODO: perform this here or in save result?
        let mut lease = ctx.accounts.lease.load_mut()?;
        lease.update_count = lease
            .update_count
            .checked_add(1)
            .ok_or(SwitchboardError::IntegerOverflowError)?;
        let oracle_list = queue.next_n(buf, aggregator.oracle_request_batch_size)?;
        aggregator.init_new_round(&clock, &oracle_list);
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
            &ctx.accounts.payout_wallet,
            &ctx.accounts.program_state.to_account_info(),
            &[&[STATE_SEED, &[params.state_bump]]],
            queue.reward,
        )?;
        lease.maybe_freeze_escrow(
            &ctx.accounts.token_program,
            &ctx.accounts.escrow,
            &ctx.accounts.mint,
            &ctx.accounts.program_state.to_account_info(),
            params.state_bump,
        )?;

        emit!(AggregatorOpenRoundEvent {
            feed_pubkey: ctx.accounts.aggregator.key(),
            oracle_pubkeys: oracle_list,
            job_pubkeys: aggregator.job_pubkeys_data[..aggregator.job_pubkeys_size as usize]
                .to_vec(),
            remaining_funds: ctx.accounts.escrow.amount,
            queue_authority: queue.authority,
        });
        Ok(())
    }
}
