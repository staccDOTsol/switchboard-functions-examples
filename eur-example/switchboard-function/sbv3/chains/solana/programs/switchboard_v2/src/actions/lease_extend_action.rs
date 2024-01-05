use crate::*;
use anchor_lang::prelude::*;

use anchor_spl::token::{Mint, Token, TokenAccount};

#[derive(Accounts)]
#[instruction(params: LeaseExtendParams)] // rpc parameters hint
pub struct LeaseExtend<'info> {
    #[account(
        mut,
        seeds = [
            LEASE_SEED,
            queue.key().as_ref(),
            aggregator.key().as_ref()
        ],
        has_one = escrow,
        bump = params.lease_bump)]
    pub lease: AccountLoader<'info, LeaseAccountData>,
    pub aggregator: AccountLoader<'info, AggregatorAccountData>,
    pub queue: AccountLoader<'info, OracleQueueAccountData>,
    #[account(mut, has_one = owner @ SwitchboardError::InvalidAuthorityError,
        constraint = funder.mint == queue.load()?.get_mint())]
    pub funder: Account<'info, TokenAccount>,
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut,
        constraint = escrow.mint == queue.load()?.get_mint() &&
        escrow.owner == program_state.key()
    )]
    pub escrow: Account<'info, TokenAccount>,
    #[account(address = anchor_spl::token::ID)]
    pub token_program: Program<'info, Token>,
    #[account(seeds = [STATE_SEED], bump = params.state_bump)]
    pub program_state: AccountLoader<'info, SbState>,
    #[account(address = queue.load()?.get_mint())]
    pub mint: Account<'info, Mint>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct LeaseExtendParams {
    pub load_amount: u64,
    pub lease_bump: u8,
    pub state_bump: u8,
    pub wallet_bumps: Vec<u8>,
}
impl<'a> LeaseExtend<'a> {
    pub fn validate(&self, ctx: &Context<Self>, params: &LeaseExtendParams) -> Result<()> {
        let queue = ctx.accounts.queue.load()?;
        let aggregator = ctx.accounts.aggregator.load()?;
        let jobs_len = aggregator.job_pubkeys_size as usize;
        require!(
            ctx.remaining_accounts.len() >= jobs_len * 2,
            SwitchboardError::MissingRequiredAccountsError
        );
        require!(
            params.wallet_bumps.len() == jobs_len,
            SwitchboardError::MissingRequiredAccountsError
        );
        LeaseAccountData::validate_remaining_accounts(
            &aggregator,
            &queue,
            ctx.remaining_accounts,
            jobs_len,
        )?;
        Ok(())
    }

    pub fn actuate(ctx: &Ctx<'_, 'a, LeaseExtend<'a>>, params: &LeaseExtendParams) -> Result<()> {
        let queue = ctx.accounts.queue.load()?;
        let aggregator = ctx.accounts.aggregator.load()?;
        let escrow = &ctx.accounts.escrow;
        let load_amount = params.load_amount;
        let mut lease = ctx.accounts.lease.load_mut()?;
        lease.maybe_thaw_escrow(
            &ctx.accounts.token_program,
            &ctx.accounts.escrow,
            &ctx.accounts.mint,
            &ctx.accounts.program_state.to_account_info(),
            params.state_bump,
        )?;
        // Amount for escrow to payout 1 round
        let round_rewards = queue.max_round_rewards(aggregator.oracle_request_batch_size);
        // Reset probation period if the escrow is newly funded after depletion.
        // TODO (mgild): people can avoid this by just funding the escrow themselves,
        // outside this call.
        if escrow.amount < round_rewards && escrow.amount + load_amount >= round_rewards {
            lease.update_count = 0;
        }
        if escrow.amount + load_amount >= round_rewards {
            lease.is_active = true;
        }
        transfer(
            &ctx.accounts.token_program,
            &ctx.accounts.funder,
            &ctx.accounts.escrow,
            &ctx.accounts.owner,
            &[],
            params.load_amount,
        )?;
        let clock = Clock::get()?;
        emit!(LeaseFundEvent {
            lease_pubkey: ctx.accounts.lease.key(),
            funder: ctx.accounts.funder.key(),
            amount: params.load_amount, // TODO: Reserve some for curators
            timestamp: clock.unix_timestamp,
        });
        lease.maybe_freeze_escrow(
            &ctx.accounts.token_program,
            &ctx.accounts.escrow,
            &ctx.accounts.mint,
            &ctx.accounts.program_state.to_account_info(),
            params.state_bump,
        )?;

        // Pay out curators
        // let jobs_len = ctx.accounts.aggregator.load()?.job_pubkeys_size as usize;
        // let (_, maybe_token_accounts) =
        // LeaseAccountData::get_remaining_accounts(ctx.remaining_accounts, jobs_len);
        // for maybe_ta in maybe_token_accounts {
        // if let Some(curator_wallet) = maybe_ta {
        // transfer(
        // &ctx.accounts.token_program,
        // &ctx.accounts.funder,
        // &curator_wallet,
        // &ctx.accounts.owner,
        // &[],
        // 0, // TODO: DECIDE AMOUNT
        // )
        // .ok(); // Ignore errors
        // }
        // }
        Ok(())
    }
}
