use crate::*;

use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(params: BufferRelayerOpenRoundParams)] // rpc parameters hint
pub struct BufferRelayerOpenRound<'info> {
    #[account(mut, has_one = escrow)]
    pub buffer_relayer: Account<'info, BufferRelayerAccountData>,
    #[account(mut, has_one = data_buffer)]
    pub oracle_queue: AccountLoader<'info, OracleQueueAccountData>,
    /// CHECK: [constraint_of:oracle_queue]
    #[account(mut)]
    pub data_buffer: AccountInfo<'info>,
    #[account(mut, seeds = [PERMISSION_SEED,
        oracle_queue.load()?.authority.key().as_ref(),
        oracle_queue.key().as_ref(),
        buffer_relayer.key().as_ref()],
        bump = params.permission_bump)]
    pub permission: AccountLoader<'info, PermissionAccountData>,
    #[account(mut)]
    pub escrow: Account<'info, TokenAccount>,
    #[account(seeds = [STATE_SEED], bump = params.state_bump)]
    pub program_state: AccountLoader<'info, SbState>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct BufferRelayerOpenRoundParams {
    pub state_bump: u8,
    pub permission_bump: u8,
}
impl BufferRelayerOpenRound<'_> {
    pub fn validate(
        &self,
        ctx: &Context<Self>,
        _params: &BufferRelayerOpenRoundParams,
    ) -> Result<()> {
        let buffer_relayer = &ctx.accounts.buffer_relayer;
        let permission = ctx.accounts.permission.load()?;
        let queue = ctx.accounts.oracle_queue.load()?;
        let clock = Clock::get()?;
        let allowed_timestamp = buffer_relayer
            .current_round
            .round_open_timestamp
            .checked_add(buffer_relayer.min_update_delay_seconds.into())
            .unwrap();
        if buffer_relayer.queue_pubkey != ctx.accounts.oracle_queue.key() {
            return Err(error!(SwitchboardError::OracleQueueMismatch));
        }
        if !queue.unpermissioned_feeds_enabled
            && !(permission.permissions & SwitchboardPermission::PermitOracleQueueUsage)
        {
            return Err(error!(SwitchboardError::PermissionDenied));
        }
        // if !queue.enable_buffer_relayers {
        // return Err(error!(SwitchboardError::PermissionDenied));
        // }
        if clock.unix_timestamp < allowed_timestamp {
            return Err(error!(SwitchboardError::BufferRelayerIllegalRoundOpenCall));
        }
        Ok(())
    }

    // TODO: assert escrow has the funds
    pub fn actuate(
        ctx: &mut Context<BufferRelayerOpenRound>,
        _params: &BufferRelayerOpenRoundParams,
    ) -> Result<()> {
        let buffer_relayer = &mut ctx.accounts.buffer_relayer;
        let mut buf = ctx.accounts.data_buffer.try_borrow_mut_data()?;
        let buf = OracleQueueAccountData::convert_buffer(*buf);
        let mut queue = ctx.accounts.oracle_queue.load_mut()?;
        let clock = Clock::get()?;
        let oracle_list = queue.next_n(buf, 1)?;
        buffer_relayer.current_round = BufferRelayerRound {
            round_open_slot: clock.slot,
            round_open_timestamp: clock.unix_timestamp,
            oracle_pubkey: oracle_list[0],
            ..Default::default()
        };
        emit!(BufferRelayerOpenRoundEvent {
            relayer_pubkey: ctx.accounts.buffer_relayer.key(),
            job_pubkey: ctx.accounts.buffer_relayer.job_pubkey,
            oracle_pubkeys: oracle_list,
            remaining_funds: ctx.accounts.escrow.amount,
            queue: ctx.accounts.oracle_queue.key(),
        });
        Ok(())
    }
}
