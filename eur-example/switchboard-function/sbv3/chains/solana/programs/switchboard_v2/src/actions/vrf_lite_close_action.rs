use crate::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{CloseAccount, Token, TokenAccount};

#[derive(Accounts)]
#[instruction(params: VrfLiteCloseParams)] // rpc parameters hint
pub struct VrfLiteClose<'info> {
    /// CHECK: checked in vrf_lite has_one, must sign to authorize closing
    pub authority: Signer<'info>,
    #[account(
        mut,
        close = sol_dest,
        has_one = escrow,
        has_one = authority,
        has_one = queue
    )]
    pub vrf_lite: AccountLoader<'info, VrfLiteAccountData>,
    #[account(
        mut,
        close = sol_dest,
        seeds = [
            PERMISSION_SEED,
            queue_authority.key().as_ref(),
            queue.key().as_ref(),
            vrf_lite.key().as_ref()
        ],
        bump = vrf_lite.load()?.permission_bump,
    )]
    pub permission: AccountLoader<'info, PermissionAccountData>,

    #[account(
        constraint = queue.load()?.authority == queue_authority.key()
    )]
    pub queue: AccountLoader<'info, OracleQueueAccountData>,
    /// CHECK:
    pub queue_authority: AccountInfo<'info>,
    #[account(
        seeds = [STATE_SEED], 
        bump = vrf_lite.load()?.state_bump
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
pub struct VrfLiteCloseParams {}

impl VrfLiteClose<'_> {
    pub fn validate(&self, ctx: &Context<Self>, _params: &VrfLiteCloseParams) -> Result<()> {
        // 1500 slots, 400ms/slot = about 10min
        if ctx.accounts.vrf_lite.load()?.request_slot != 0
            && ctx.accounts.vrf_lite.load()?.request_slot + 1500 > Clock::get()?.slot
        {
            return Err(error!(SwitchboardError::AccountCloseNotReady));
        }
        if ctx.accounts.vrf_lite.load()?.vrf_pool != Pubkey::default() {
            return Err(error!(SwitchboardError::VrfLiteOwnedByPool));
        }

        Ok(())
    }

    pub fn actuate(ctx: &Context<VrfLiteClose>, _params: &VrfLiteCloseParams) -> Result<()> {
        let vrf_lite = ctx.accounts.vrf_lite.load()?;
        let state_bump = vrf_lite.state_bump;
        drop(vrf_lite);

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
                    &[&[STATE_SEED, &[state_bump]]],
                ),
                ctx.accounts.escrow.amount,
            )?;
        }

        token::close_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            CloseAccount {
                account: ctx.accounts.escrow.to_account_info(),
                destination: ctx.accounts.sol_dest.to_account_info(),
                authority: ctx.accounts.program_state.to_account_info(),
            },
            &[&[STATE_SEED, &[state_bump]]],
        ))?;

        Ok(())
    }
}
