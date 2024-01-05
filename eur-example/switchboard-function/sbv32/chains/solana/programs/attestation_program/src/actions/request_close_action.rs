use crate::*;

use anchor_lang::prelude::*;
use anchor_spl::token::{CloseAccount, Token, TokenAccount};
use solana_program::sysvar::clock;

#[derive(Accounts)]
#[instruction(params: FunctionRequestCloseParams)] // rpc parameters hint
pub struct FunctionRequestClose<'info> {
    #[account(
        mut,
        close = sol_dest,
        has_one = function,
        has_one = escrow @ SwitchboardError::InvalidEscrow,
        has_one = authority @ SwitchboardError::InvalidAuthority,
    )]
    pub request: Box<Account<'info, FunctionRequestAccountData>>,

    /// CHECK: Only needs to sign if request.garbage_collection_slot has not elapsed
    pub authority: AccountInfo<'info>,

    // /// CHECK: might be allowed to close
    // pub function_authority: Option<AccountInfo<'info>>,
    #[account(
        mut,
        constraint = escrow.is_native() && escrow.owner == state.key()
    )]
    pub escrow: Box<Account<'info, TokenAccount>>,

    /// CHECK: we need to load_mut and remove_request
    #[account(mut)]
    pub function: AccountLoader<'info, FunctionAccountData>,

    /// CHECK: allow partial funds to be sent to the claimer only if request.garbage_collection_slot has elapsed
    #[account(mut)]
    pub sol_dest: AccountInfo<'info>,

    #[account(
        mut,
        constraint = escrow_dest.is_native() &&
                escrow_dest.owner == request.authority // can only send funds to the account owner
    )]
    pub escrow_dest: Box<Account<'info, TokenAccount>>,

    #[account(
        seeds = [STATE_SEED],
        bump = state.load()?.bump,
    )]
    pub state: AccountLoader<'info, AttestationProgramState>,

    pub token_program: Program<'info, Token>,

    pub system_program: Program<'info, System>,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct FunctionRequestCloseParams {}

impl FunctionRequestClose<'_> {
    pub fn validate(
        &self,
        ctx: &Context<Self>,
        _params: &FunctionRequestCloseParams,
    ) -> Result<()> {
        if ctx.accounts.request.is_round_active(&Clock::get()?) {
            return Err(error!(SwitchboardError::IllegalExecuteAttempt));
        }

        // if authority has signed they can close the account whenever they need
        if ctx.accounts.authority.is_signer {
            return Ok(());
        }

        // if authority hasnt signed, check if the garbage collection slot has elapsed
        if let Some(garbage_collection_slot) = ctx.accounts.request.garbage_collection_slot {
            if garbage_collection_slot > clock::Clock::get()?.slot {
                return Err(error!(SwitchboardError::AccountCloseNotReady));
            }
        } else {
            return Err(error!(SwitchboardError::AccountCloseNotPermitted));
        }

        Ok(())
    }

    pub fn actuate(ctx: &mut Context<Self>, _params: &FunctionRequestCloseParams) -> Result<()> {
        let mut function = ctx.accounts.function.load_mut()?;
        function.remove_request()?;

        // transfer any remaining balance from the escrow
        transfer(
            &ctx.accounts.token_program.to_account_info(),
            &ctx.accounts.escrow,
            &ctx.accounts.escrow_dest,
            &ctx.accounts.state.to_account_info().clone(),
            &[&[STATE_SEED, &[ctx.accounts.state.load()?.bump]]],
            ctx.accounts.escrow.amount,
        )?;

        // Try to close the token account
        if ctx.accounts.escrow.close_authority.is_some()
            && ctx.accounts.escrow.close_authority.unwrap() == ctx.accounts.state.key()
        {
            // close the token account
            token::close_account(CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                CloseAccount {
                    account: ctx.accounts.escrow.to_account_info(),
                    destination: ctx.accounts.sol_dest.to_account_info(),
                    authority: ctx.accounts.state.to_account_info(),
                },
                &[&[STATE_SEED, &[ctx.accounts.state.load()?.bump]]],
            ))?;
        }

        // // TODO: verify sol_dest receives funds. How does a program sign on behalf of a non-PDA?
        // if ctx.accounts.authority.key() != ctx.accounts.sol_dest.key() {
        //     // give some funds to the sol_dest for closing the account
        //     let transfer_amount = ctx
        //         .accounts
        //         .request
        //         .to_account_info()
        //         .lamports()
        //         .checked_div(100)
        //         .unwrap_or_default();
        //     if transfer_amount > 0 {
        //         anchor_lang::system_program::transfer(
        //             CpiContext::new(
        //                 ctx.accounts.system_program.to_account_info(),
        //                 anchor_lang::system_program::Transfer {
        //                     from: ctx.accounts.request.to_account_info(),
        //                     to: ctx.accounts.sol_dest.to_account_info(),
        //                 },
        //             ),
        //             transfer_amount,
        //         )?;
        //     }
        // }

        emit!(FunctionRequestCloseEvent {
            request: ctx.accounts.request.key(),
            slot: Clock::get()?.slot,
        });

        Ok(())
    }
}
