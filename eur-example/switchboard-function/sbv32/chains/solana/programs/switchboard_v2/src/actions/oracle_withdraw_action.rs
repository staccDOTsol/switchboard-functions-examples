use crate::*;
use anchor_lang::prelude::*;
use anchor_spl::token::Token;

#[derive(Accounts)]
#[instruction(params: OracleWithdrawParams)] // rpc parameters hint
pub struct OracleWithdraw<'info> {
    #[account(mut,
        has_one = oracle_authority @ SwitchboardError::InvalidAuthorityError,
        has_one = token_account)]
    pub oracle: AccountLoader<'info, OracleAccountData>,
    pub oracle_authority: Signer<'info>,
    #[account(mut, constraint = token_account.mint == oracle_queue.load()?.get_mint())]
    pub token_account: Account<'info, TokenAccount>,
    #[account(mut, constraint = withdraw_account.mint == oracle_queue.load()?.get_mint())]
    pub withdraw_account: Account<'info, TokenAccount>,
    #[account(mut, constraint = oracle.load()?.queue_pubkey == oracle_queue.key())]
    pub oracle_queue: AccountLoader<'info, OracleQueueAccountData>,
    #[account(mut, seeds = [
        PERMISSION_SEED,
        oracle_queue.load()?.authority.as_ref(),
        oracle_queue.key().as_ref(),
        oracle.key().as_ref()],
        bump = params.permission_bump,
    )]
    pub permission: AccountLoader<'info, PermissionAccountData>,
    #[account(address = anchor_spl::token::ID)]
    pub token_program: Program<'info, Token>,
    #[account(seeds = [STATE_SEED], bump = params.state_bump)]
    pub program_state: AccountLoader<'info, SbState>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(address = solana_program::system_program::ID)]
    pub system_program: Program<'info, System>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct OracleWithdrawParams {
    pub state_bump: u8,
    pub permission_bump: u8,
    pub amount: u64,
}
impl OracleWithdraw<'_> {
    pub fn validate(&self, _ctx: &Context<Self>, _params: &OracleWithdrawParams) -> Result<()> {
        Ok(())
    }

    pub fn actuate(ctx: &Context<Self>, params: &OracleWithdrawParams) -> Result<()> {
        let queue = ctx.accounts.oracle_queue.load()?;
        let clock = Clock::get()?;
        let previous_amount = ctx.accounts.token_account.amount;
        transfer(
            &ctx.accounts.token_program,
            &ctx.accounts.token_account,
            &ctx.accounts.withdraw_account,
            &ctx.accounts.program_state.to_account_info(),
            &[&[STATE_SEED, &[params.state_bump]]],
            params.amount,
        )?;
        let new_amount = ctx.accounts.token_account.amount;
        let permission = ctx.accounts.permission.load_mut();
        if permission.is_ok() {
            if new_amount < queue.min_stake {
                permission?.permissions &= !(SwitchboardPermission::PermitOracleHeartbeat as u32);
            }
        } else {
            drop(permission);
            let mut permission = ctx.accounts.permission.load_init()?;
            permission.authority = queue.authority;
            permission.granter = ctx.accounts.oracle_queue.key();
            permission.grantee = ctx.accounts.oracle.key();
        }
        emit!(OracleWithdrawEvent {
            oracle_pubkey: ctx.accounts.oracle.key(),
            wallet_pubkey: ctx.accounts.token_account.key(),
            destination_wallet: ctx.accounts.withdraw_account.key(),
            previous_amount,
            new_amount,
            timestamp: clock.unix_timestamp,
        });
        Ok(())
    }
}
