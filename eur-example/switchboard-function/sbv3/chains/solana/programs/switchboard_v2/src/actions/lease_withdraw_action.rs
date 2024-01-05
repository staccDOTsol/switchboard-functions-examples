use crate::*;
use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use anchor_spl::token::Token;
use std::cmp::min;

#[derive(Accounts)]
#[instruction(params: LeaseWithdrawParams)] // rpc parameters hint
pub struct LeaseWithdraw<'info> {
    #[account(mut,
        seeds = [
            LEASE_SEED,
            queue.key().as_ref(),
            aggregator.key().as_ref()
        ],
        has_one = escrow,
        has_one = withdraw_authority,
        bump = params.lease_bump)]
    pub lease: AccountLoader<'info, LeaseAccountData>,
    #[account(mut,
        constraint = escrow.mint == queue.load()?.get_mint() &&
        escrow.owner == program_state.key()
    )]
    pub escrow: Account<'info, TokenAccount>,
    pub aggregator: AccountLoader<'info, AggregatorAccountData>,
    pub queue: AccountLoader<'info, OracleQueueAccountData>,
    pub withdraw_authority: Signer<'info>,
    #[account(mut, constraint = withdraw_account.mint == queue.load()?.get_mint())]
    pub withdraw_account: Account<'info, TokenAccount>,
    #[account(address = anchor_spl::token::ID)]
    pub token_program: Program<'info, Token>,
    #[account(seeds = [STATE_SEED], bump = params.state_bump)]
    pub program_state: AccountLoader<'info, SbState>,
    #[account(address = queue.load()?.get_mint())]
    pub mint: Account<'info, Mint>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct LeaseWithdrawParams {
    pub state_bump: u8,
    pub lease_bump: u8,
    pub amount: u64,
}
impl LeaseWithdraw<'_> {
    pub fn validate(&self, ctx: &Context<Self>, _params: &LeaseWithdrawParams) -> Result<()> {
        if *ctx.accounts.withdraw_authority.key == Pubkey::default() {
            return Err(error!(SwitchboardError::InvalidAuthorityError));
        }
        Ok(())
    }

    pub fn actuate(ctx: &Context<Self>, params: &LeaseWithdrawParams) -> Result<()> {
        let mut lease = ctx.accounts.lease.load_mut()?;
        let queue = ctx.accounts.queue.load()?;
        let aggregator = ctx.accounts.aggregator.load()?;
        let clock = Clock::get()?;
        let previous_amount = ctx.accounts.escrow.amount;
        let max_amount = ctx
            .accounts
            .escrow
            .amount
            .saturating_sub(queue.max_round_rewards(aggregator.oracle_request_batch_size));
        let amount = min(max_amount, params.amount);
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
            &ctx.accounts.withdraw_account,
            &ctx.accounts.program_state.to_account_info(),
            &[&[STATE_SEED, &[params.state_bump]]],
            amount,
        )?;
        lease.maybe_freeze_escrow(
            &ctx.accounts.token_program,
            &ctx.accounts.escrow,
            &ctx.accounts.mint,
            &ctx.accounts.program_state.to_account_info(),
            params.state_bump,
        )?;
        let new_amount = ctx.accounts.escrow.amount;
        // Reset probation period if the escrow is newly funded after depletion.
        if new_amount < queue.max_round_rewards(aggregator.oracle_request_batch_size) {
            lease.is_active = false;
        }
        emit!(LeaseWithdrawEvent {
            lease_pubkey: ctx.accounts.lease.key(),
            wallet_pubkey: ctx.accounts.withdraw_account.key(),
            previous_amount,
            new_amount,
            timestamp: clock.unix_timestamp,
        });
        Ok(())
    }
}
