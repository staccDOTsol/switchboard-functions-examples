use crate::*;
use anchor_spl::token::Token;

use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(params: BufferRelayerSaveResultParams)] // rpc parameters hint
pub struct BufferRelayerSaveResult<'info> {
    #[account(mut, has_one = escrow)]
    pub buffer_relayer: Account<'info, BufferRelayerAccountData>,
    pub oracle_authority: Signer<'info>,
    #[account(
        has_one = oracle_authority,
        constraint = oracle_queue.key() == oracle.load()?.queue_pubkey,
        constraint = oracle.load()?.token_account == oracle_wallet.key())]
    pub oracle: AccountLoader<'info, OracleAccountData>,
    #[account(mut, has_one = data_buffer)]
    pub oracle_queue: AccountLoader<'info, OracleQueueAccountData>,
    /// CHECK: [constraint_of:oracle_queue]
    #[account(mut)]
    pub data_buffer: AccountInfo<'info>,
    /// CHECK: [non_signining_authority]
    #[account(constraint = oracle_queue.load()?.authority == queue_authority.key()
         @ SwitchboardError::InvalidAuthorityError)]
    pub queue_authority: AccountInfo<'info>,
    #[account(mut, seeds = [PERMISSION_SEED,
        queue_authority.key().as_ref(),
        oracle_queue.key().as_ref(),
        buffer_relayer.key().as_ref()],
        bump = params.permission_bump)]
    pub permission: AccountLoader<'info, PermissionAccountData>,
    #[account(mut)]
    pub escrow: Account<'info, TokenAccount>,
    #[account(mut)]
    pub oracle_wallet: Account<'info, TokenAccount>,
    #[account(seeds = [STATE_SEED], bump = params.state_bump)]
    pub program_state: AccountLoader<'info, SbState>,
    pub token_program: Program<'info, Token>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct BufferRelayerSaveResultParams {
    pub state_bump: u8,
    pub permission_bump: u8,
    pub result: Vec<u8>,
    pub success: bool,
}
impl BufferRelayerSaveResult<'_> {
    pub fn validate(
        &self,
        ctx: &Context<Self>,
        _params: &BufferRelayerSaveResultParams,
    ) -> Result<()> {
        let buffer_relayer = &ctx.accounts.buffer_relayer;
        let permission = ctx.accounts.permission.load()?;
        let queue = ctx.accounts.oracle_queue.load()?;
        if buffer_relayer.queue_pubkey != ctx.accounts.oracle_queue.key() {
            return Err(error!(SwitchboardError::OracleQueueMismatch));
        }
        if !queue.unpermissioned_feeds_enabled
            && !(permission.permissions & SwitchboardPermission::PermitOracleQueueUsage)
        {
            return Err(error!(SwitchboardError::PermissionDenied));
        }
        if ctx.accounts.oracle.key() != buffer_relayer.current_round.oracle_pubkey {
            return Err(error!(SwitchboardError::PermissionDenied));
        }
        Ok(())
    }

    pub fn actuate(
        ctx: &mut Context<BufferRelayerSaveResult>,
        params: &BufferRelayerSaveResultParams,
    ) -> Result<()> {
        let buffer_relayer = &mut ctx.accounts.buffer_relayer;
        if !params.success {
            buffer_relayer.current_round.num_error += 1;
            return Ok(());
        }
        buffer_relayer.result = params.result.clone();
        buffer_relayer.current_round.num_success += 1;
        buffer_relayer.latest_confirmed_round = buffer_relayer.current_round.clone();
        transfer(
            &ctx.accounts.token_program.to_account_info(),
            &ctx.accounts.escrow,
            &ctx.accounts.oracle_wallet,
            &ctx.accounts.program_state.to_account_info(),
            &[&[STATE_SEED, &[params.state_bump]]],
            ctx.accounts.oracle_queue.load()?.reward,
        )?;
        Ok(())
    }
}
