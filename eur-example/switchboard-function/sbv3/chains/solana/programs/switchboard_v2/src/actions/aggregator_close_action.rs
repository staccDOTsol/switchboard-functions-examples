/**
 * Close an Aggregator, Lease, and Permission account and transfer the remaining lease escrow balance
 */
use crate::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{CloseAccount, Token, TokenAccount};

#[derive(Accounts)]
#[instruction(params: AggregatorCloseParams)] // rpc parameters hint
pub struct AggregatorClose<'info> {
    /// CHECK: todo
    pub authority: Signer<'info>,
    #[account(
        mut,
        close = sol_dest,
        constraint = aggregator.load()?.queue_pubkey == oracle_queue.key()
    )]
    pub aggregator: AccountLoader<'info, AggregatorAccountData>,
    #[account(
        mut,
        close = sol_dest,
        seeds = [
            PERMISSION_SEED,
            queue_authority.key().as_ref(),
            oracle_queue.key().as_ref(),
            aggregator.key().as_ref()
        ],
        bump = params.permission_bump,
    )]
    pub permission: AccountLoader<'info, PermissionAccountData>,
    #[account(
        mut, 
        close = sol_dest,
        has_one = escrow,
        seeds = [
            LEASE_SEED,
            oracle_queue.key().as_ref(),
            aggregator.key().as_ref()
        ],
        bump = params.lease_bump,
        constraint = aggregator.key() == lease.load()?.aggregator && oracle_queue.key() == lease.load()?.queue
    )]
    pub lease: AccountLoader<'info, LeaseAccountData>,
    #[account(
        mut, 
        constraint = escrow.mint == oracle_queue.load()?.get_mint() && escrow.owner == program_state.key()
    )]
    pub escrow: Account<'info, TokenAccount>,

    #[account(
        constraint = oracle_queue.load()?.authority == queue_authority.key()
    )]
    pub oracle_queue: AccountLoader<'info, OracleQueueAccountData>,
    /// CHECK:
    pub queue_authority: AccountInfo<'info>,
    #[account(
        seeds = [STATE_SEED], 
        bump = params.state_bump
    )]
    pub program_state: AccountLoader<'info, SbState>,

    /// CHECK:
    pub sol_dest: SystemAccount<'info>,
    /// CHECK:
    #[account(mut)]
    pub escrow_dest: Account<'info, TokenAccount>,

    #[account(address = anchor_spl::token::ID)]
    pub token_program: Program<'info, Token>,

    /// Optional accounts
    /// CHECK:
    #[account(mut)]
    pub crank: Option<AccountLoader<'info, CrankAccountData>>,
    /// CHECK: todo
    #[account(mut)]
    pub data_buffer: Option<AccountInfo<'info>>,
    /// CHECK: todo
    #[account(
        mut,
        close = sol_dest,
        seeds = [SLIDING_RESULT_SEED, aggregator.key().as_ref()],
        bump = sliding_window.load()?.bump
    )]
    pub sliding_window: Option<AccountLoader<'info, SlidingResultAccountData>>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct AggregatorCloseParams {
    state_bump: u8,
    permission_bump: u8,
    lease_bump: u8,
}

impl AggregatorClose<'_> {
    pub fn validate(&self, _ctx: &Context<Self>, _params: &AggregatorCloseParams) -> Result<()> {
        Ok(())
    }

    pub fn actuate(ctx: &Context<AggregatorClose>, params: &AggregatorCloseParams) -> Result<()> {
        let aggregator_key = ctx.accounts.aggregator.key();
        let aggregator = ctx.accounts.aggregator.load()?;

        // pop the aggregator from the crank if it exists
        let crank_row_count = ctx.accounts.lease.load()?.crank_row_count;
        match crank_row_count {
            0 => msg!("aggregator is not on a crank"),
            1 => {
                assert!(
                    aggregator.crank_pubkey != Pubkey::default(),
                    "aggregators crank pubkey cannot be empty if crank_row_count is greater than 0"
                );

                if ctx.accounts.crank.is_none() {
                    return Err(error!(SwitchboardError::MissingOptionalAccount));
                }
                let crank_acc = ctx.accounts.crank.as_ref().unwrap();
                let mut crank = crank_acc.load_mut()?;
                if aggregator.crank_pubkey != crank_acc.key() {
                    return Err(error!(SwitchboardError::InvalidCrankAccountError));
                }

                if ctx.accounts.data_buffer.is_none() {
                    return Err(error!(SwitchboardError::MissingOptionalAccount));
                }
                let data_buffer_acc = ctx.accounts.data_buffer.as_ref().unwrap();
                if crank.data_buffer != data_buffer_acc.key() {
                    return Err(error!(SwitchboardError::InvalidCrankAccountError));
                }

                let mut buf = data_buffer_acc.try_borrow_mut_data()?;
                let buf = CrankAccountData::convert_buffer(*buf);
                let (crank_idx, _row) = buf
                    .iter()
                    .enumerate()
                    .find(|(_idx, row)| row.pubkey == aggregator_key)
                    .unwrap();
                msg!("crank idx {}", crank_idx);
                let popped_key = crank.pop(buf, crank_idx)?;
                msg!("aggregator key {}", aggregator_key);
                msg!("popped key {}", popped_key);
                assert!(aggregator_key == popped_key);
            }
            _ => return Err(error!(SwitchboardError::InvalidCrankAccountError)),
        }

        if ctx.accounts.sliding_window.is_some() {
            let slider_loader = ctx.accounts.sliding_window.as_ref().unwrap();
            let slider = slider_loader.load()?;
            let correct_key = SlidingResultAccountData::key_from_seed(
                ctx.program_id,
                &ctx.accounts.aggregator.key(),
                slider.bump,
            )?;
            if slider_loader.key() != correct_key {
                return Err(error!(SwitchboardError::InvalidSliderAccount));
            }
        } else if aggregator.resolution_mode == AggregatorResolutionMode::ModeSlidingResolution {
            return Err(error!(SwitchboardError::InvalidSliderAccount));
        }

        // transfer remaining escrow
        if ctx.accounts.escrow.amount > 0 {
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.escrow.to_account_info(),
                        to: ctx.accounts.escrow_dest.to_account_info(),
                        authority: ctx.accounts.program_state.to_account_info().clone(),
                    },
                    &[&[STATE_SEED, &[params.state_bump]]],
                ),
                ctx.accounts.escrow.amount,
            )?;
        }

        if ctx.accounts.escrow.close_authority.is_none()
            || ctx.accounts.escrow.close_authority.unwrap() != ctx.accounts.program_state.key()
        {
            msg!(
                "cannot close lease escrow token account, authority = {:?}",
                ctx.accounts.escrow.close_authority
            );
        } else {
            token::close_account(CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                CloseAccount {
                    account: ctx.accounts.escrow.to_account_info(),
                    destination: ctx.accounts.sol_dest.to_account_info(),
                    authority: ctx.accounts.program_state.to_account_info(),
                },
                &[&[STATE_SEED, &[params.state_bump]]],
            ))?;
        }

        Ok(())
    }
}
