use crate::*;
use anchor_lang::prelude::*;

use anchor_spl::token::Mint;
use anchor_spl::token::Token;
use anchor_spl::token::TokenAccount;
use anchor_spl::token::{self, Transfer};
use solana_program::program_option::COption;

pub fn find_associated_token_address(key: &Pubkey, mint: &Pubkey) -> Pubkey {
    let (akey, _) = Pubkey::find_program_address(
        &[key.as_ref(), anchor_spl::token::ID.as_ref(), mint.as_ref()],
        &ATOKEN_PID,
    );
    akey
}

#[derive(Accounts)]
#[instruction(params: LeaseInitParams)] // rpc parameters hint
pub struct LeaseInit<'info> {
    #[account(
        init,
        seeds = [
            LEASE_SEED,
            queue.key().as_ref(),
            aggregator.key().as_ref()
        ],
        bump,
        space = LeaseAccountData::size(),
        payer = payer)]
    pub lease: AccountLoader<'info, LeaseAccountData>,
    #[account(mut)]
    pub queue: AccountLoader<'info, OracleQueueAccountData>,
    pub aggregator: AccountLoader<'info, AggregatorAccountData>,
    // #[account(mut, constraint = funder.mint == escrow.mint)]
    #[account(mut)]
    pub funder: Account<'info, TokenAccount>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(address = solana_program::system_program::ID)]
    pub system_program: Program<'info, System>,
    #[account(address = anchor_spl::token::ID)]
    pub token_program: Program<'info, Token>,
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut, constraint =
        escrow.mint == queue.load()?.get_mint() &&
        escrow.owner == lease.key() &&
        escrow.delegate == COption::None &&
        escrow.close_authority == COption::None, // prevents escrow assignment to multiple leases
    )]
    pub escrow: Account<'info, TokenAccount>,
    #[account(seeds = [STATE_SEED], bump = params.state_bump)]
    pub program_state: AccountLoader<'info, SbState>,
    #[account(address = queue.load()?.get_mint())]
    pub mint: Account<'info, Mint>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct LeaseInitParams {
    pub load_amount: u64,
    pub withdraw_authority: Pubkey,
    pub lease_bump: u8,
    pub state_bump: u8,
    pub wallet_bumps: Vec<u8>,
}
impl<'a> LeaseInit<'a> {
    pub fn validate(&self, ctx: &Context<Self>, params: &LeaseInitParams) -> Result<()> {
        let queue = ctx.accounts.queue.load()?;
        let escrow_key =
            find_associated_token_address(&ctx.accounts.lease.key(), &queue.get_mint());
        if escrow_key != ctx.accounts.escrow.key() {
            return Err(error!(SwitchboardError::InvalidLeaseAccountEscrowError));
        }
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

    pub fn actuate(ctx: &Ctx<'_, 'a, LeaseInit<'a>>, params: &LeaseInitParams) -> Result<()> {
        let token_program = ctx.accounts.token_program.clone();
        let clock = Clock::get()?;
        // ensure signer. Escrow should always sign on setting
        let queue_key = ctx.accounts.queue.key();
        let aggregator_key = ctx.accounts.aggregator.key();
        let lease_seeds: &[&[&[u8]]] = &[&[
            LEASE_SEED,
            queue_key.as_ref(),
            aggregator_key.as_ref(),
            &[params.lease_bump],
        ]];

        let cpi_accounts = Transfer {
            from: ctx.accounts.funder.to_account_info(),
            to: ctx.accounts.escrow.to_account_info(),
            authority: ctx.accounts.owner.to_account_info(),
        };
        let cpi_ctx =
            CpiContext::new_with_signer(token_program.to_account_info(), cpi_accounts, lease_seeds);
        msg!("1!!!");
        token::transfer(cpi_ctx, params.load_amount)?; // TODO: reserve some for curators
        let mut lease = ctx.accounts.lease.load_init()?;
        lease.bump = *ctx.bumps.get("lease").unwrap();
        lease.escrow = ctx.accounts.escrow.key();
        lease.aggregator = ctx.accounts.aggregator.key();
        lease.queue = ctx.accounts.queue.key();
        lease.token_program = ctx.accounts.token_program.key();
        lease.is_active = true;
        lease.crank_row_count = 0;
        lease.created_at = clock.unix_timestamp;
        lease.withdraw_authority = params.withdraw_authority;
        msg!("2!!!");
        lease.maybe_freeze_escrow(
            &ctx.accounts.token_program,
            &ctx.accounts.escrow,
            &ctx.accounts.mint,
            &ctx.accounts.program_state.to_account_info(),
            params.state_bump,
        )?;
        drop(lease);

        let cpi_accounts = SetAuthority {
            account_or_mint: ctx.accounts.escrow.to_account_info().clone(),
            current_authority: ctx.accounts.lease.to_account_info().clone(),
        };
        msg!("3!!!");
        token::set_authority(
            CpiContext::new_with_signer(token_program.to_account_info(), cpi_accounts, lease_seeds),
            AuthorityType::CloseAccount,
            Some(ctx.accounts.lease.key()),
        )?;

        let cpi_accounts = SetAuthority {
            account_or_mint: ctx.accounts.escrow.to_account_info().clone(),
            current_authority: ctx.accounts.lease.to_account_info().clone(),
        };
        msg!("4");
        token::set_authority(
            CpiContext::new_with_signer(token_program.to_account_info(), cpi_accounts, lease_seeds),
            AuthorityType::AccountOwner,
            Some(ctx.accounts.program_state.key()),
        )?;

        emit!(LeaseFundEvent {
            lease_pubkey: ctx.accounts.lease.key(),
            funder: ctx.accounts.funder.key(),
            amount: params.load_amount,
            timestamp: clock.unix_timestamp,
        });

        // Pay out curators
        let jobs_len = ctx.accounts.aggregator.load()?.job_pubkeys_size as usize;
        let (_, maybe_token_accounts) =
            LeaseAccountData::get_remaining_accounts(ctx.remaining_accounts, jobs_len);
        for maybe_ta in maybe_token_accounts {
            if let Some(curator_wallet) = maybe_ta {
                transfer(
                    &ctx.accounts.token_program,
                    &ctx.accounts.funder,
                    &curator_wallet,
                    &ctx.accounts.owner,
                    &[],
                    0, // TODO: DECIDE AMOUNT
                )
                .ok(); // Ignore errors
            }
        }
        Ok(())
    }
}
