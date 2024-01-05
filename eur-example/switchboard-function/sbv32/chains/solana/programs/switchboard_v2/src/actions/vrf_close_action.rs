use crate::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{CloseAccount, Token, TokenAccount};

#[derive(Accounts)]
#[instruction(params: VrfCloseParams)] // rpc parameters hint
pub struct VrfClose<'info> {
    /// CHECK: todo
    pub authority: Signer<'info>,
    #[account(
        mut,
        close = sol_dest,
        has_one = escrow,
        has_one = authority,
        has_one = oracle_queue
    )]
    pub vrf: AccountLoader<'info, VrfAccountData>,
    #[account(
        mut,
        close = sol_dest,
        seeds = [
            PERMISSION_SEED,
            queue_authority.key().as_ref(),
            oracle_queue.key().as_ref(),
            vrf.key().as_ref()
        ],
        bump = params.permission_bump,
    )]
    pub permission: AccountLoader<'info, PermissionAccountData>,

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

    #[account(
        mut, 
        constraint = escrow.mint == escrow_dest.mint && escrow.owner == program_state.key()
    )]
    pub escrow: Account<'info, TokenAccount>,
    /// CHECK:
    pub sol_dest: SystemAccount<'info>,
    /// CHECK:
    #[account(mut)]
    pub escrow_dest: Account<'info, TokenAccount>,

    #[account(address = anchor_spl::token::ID)]
    pub token_program: Program<'info, Token>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct VrfCloseParams {
    state_bump: u8,
    permission_bump: u8,
}

impl VrfClose<'_> {
    pub fn validate(&self, ctx: &Context<Self>, _params: &VrfCloseParams) -> Result<()> {
        // 1500 slots, 400ms/slot = about 10min
        if ctx.accounts.vrf.load()?.current_round.request_slot != 0
            && ctx.accounts.vrf.load()?.current_round.request_slot + 1500 > Clock::get()?.slot
        {
            return Err(error!(SwitchboardError::AccountCloseNotReady));
        }

        Ok(())
    }

    pub fn actuate(ctx: &Context<VrfClose>, params: &VrfCloseParams) -> Result<()> {
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
                "cannot close vrf escrow token account, authority = {:?}",
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
