use crate::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(params: CrankPushParams)] // rpc parameters hint
pub struct CrankPush<'info> {
    #[account(mut, has_one = data_buffer, 
        constraint = crank.load()?.queue_pubkey == oracle_queue.key() @ SwitchboardError::OracleQueueMismatch
    )]
    pub crank: AccountLoader<'info, CrankAccountData>,
    #[account(mut)]
    pub aggregator: AccountLoader<'info, AggregatorAccountData>,
    #[account(mut)]
    pub oracle_queue: AccountLoader<'info, OracleQueueAccountData>,
    /// CHECK: todo
    #[account(constraint = oracle_queue.load()?.authority == queue_authority.key()
        @ SwitchboardError::InvalidAuthorityError)]
    pub queue_authority: AccountInfo<'info>,
    #[account(seeds = [PERMISSION_SEED,
        queue_authority.key().as_ref(),
        oracle_queue.key().as_ref(),
        aggregator.key().as_ref()],
        bump = params.permission_bump)]
    pub permission: AccountLoader<'info, PermissionAccountData>,
    #[account(mut, has_one = escrow, constraint =
        aggregator.key() == lease.load()?.aggregator &&
        oracle_queue.key() == lease.load()?.queue)]
    pub lease: AccountLoader<'info, LeaseAccountData>,
    #[account(mut, constraint =
        escrow.mint == oracle_queue.load()?.get_mint() && escrow.owner == program_state.key())]
    pub escrow: Account<'info, TokenAccount>,
    #[account(seeds = [STATE_SEED], bump = params.state_bump)]
    pub program_state: AccountLoader<'info, SbState>,
    /// CHECK: todo
    #[account(mut)]
    pub data_buffer: AccountInfo<'info>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct CrankPushParams {
    pub state_bump: u8,
    pub permission_bump: u8,
    // Allow logging of arbitrary strings for alert API connection
    pub notifi_ref: Option<[u8; 64]>,
}
impl CrankPush<'_> {
    pub fn validate(&self, ctx: &Context<Self>, _params: &CrankPushParams) -> Result<()> {
        let permission = ctx.accounts.permission.load()?;
        let lease = ctx.accounts.lease.load()?;
        let queue = ctx.accounts.oracle_queue.load()?;
        let aggregator = ctx.accounts.aggregator.load()?;
        if lease.crank_row_count == 1 {
            return Err(error!(SwitchboardError::ExcessiveCrankRowsError));
        }
        if !lease.is_active {
            return Err(error!(SwitchboardError::LeaseInactiveError));
        }
        if !queue.unpermissioned_feeds_enabled
            && !(permission.permissions & SwitchboardPermission::PermitOracleQueueUsage)
        {
            return Err(error!(SwitchboardError::PermissionDenied));
        }
        if aggregator.crank_pubkey != Pubkey::default()
            && aggregator.crank_pubkey != ctx.accounts.crank.key()
        {
            return Err(error!(SwitchboardError::InvalidCrankAccountError));
        }
        if aggregator.disable_crank {
            return Err(error!(SwitchboardError::PermissionDenied));
        }
        if aggregator.job_pubkeys_size == 0 {
            return Err(error!(SwitchboardError::NoAggregatorJobsFound));
        }
        assert_buffer_account(&ctx.program_id, &ctx.accounts.data_buffer)?;
        Ok(())
    }

    pub fn actuate(ctx: &Context<Self>, params: &CrankPushParams) -> Result<()> {
        msg!("Initiating Crank Push...");
        let mut crank = ctx.accounts.crank.load_mut()?;
        let mut lease = ctx.accounts.lease.load_mut()?;
        let mut buf = ctx.accounts.data_buffer.try_borrow_mut_data()?;
        let buf = CrankAccountData::convert_buffer(*buf);
        lease.crank_row_count = 1;
        let mut aggregator = ctx.accounts.aggregator.load_mut()?;
        if aggregator.crank_pubkey == Pubkey::default() {
            // Bind aggregator to crank if not already. Then only aggregator authority may choose the
            // crank. Crank key is set on first crank push
            aggregator.crank_pubkey = ctx.accounts.crank.key();
        }

        if let Some(notifi_ref) = params.notifi_ref {
            msg!("Notifi Auth: 0x{:?}", notifi_ref);
        }

        crank.push(
            buf,
            CrankRow {
                pubkey: ctx.accounts.aggregator.key(),
                next_timestamp: std::cmp::max(
                    aggregator.start_after,
                    Clock::get()?.unix_timestamp + aggregator.min_update_delay_seconds as i64,
                ),
            },
        )?;
        Ok(())
    }
}
