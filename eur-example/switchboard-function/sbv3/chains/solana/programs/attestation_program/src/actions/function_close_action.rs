use crate::*;

use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};
use solana_address_lookup_table_program::instruction::close_lookup_table;
use solana_address_lookup_table_program::state::AddressLookupTable;
use solana_program::program::invoke_signed;

#[derive(Accounts)]
#[instruction(params: FunctionCloseParams)] // rpc parameters hint
pub struct FunctionClose<'info> {
    #[account(
        mut,
        close = sol_dest,
        seeds = [
            FUNCTION_SEED,
            function.load()?.creator_seed.as_ref(),
            &function.load()?.created_at_slot.to_le_bytes()
        ],
        bump = function.load()?.bump,
        has_one = authority @ SwitchboardError::InvalidAuthority,
        has_one = address_lookup_table,
        has_one = escrow_wallet,
    )]
    pub function: AccountLoader<'info, FunctionAccountData>,

    pub authority: Signer<'info>,

    /// CHECK: handled in function has_one
    #[account(
        mut,
        owner = address_lookup_program.key(),
    )]
    pub address_lookup_table: AccountInfo<'info>,

    #[account(mut)]
    pub escrow_wallet: Box<Account<'info, SwitchboardWallet>>,

    /// CHECK:
    pub sol_dest: AccountInfo<'info>,

    #[account(
        mut,
        constraint = escrow_dest.is_native()
    )]
    pub escrow_dest: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,

    pub system_program: Program<'info, System>,

    /// CHECK:
    #[account(
        constraint = address_lookup_program.executable,
        address = solana_address_lookup_table_program::id(),
    )]
    pub address_lookup_program: AccountInfo<'info>,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct FunctionCloseParams {}

impl FunctionClose<'_> {
    pub fn validate(&self, ctx: &Context<Self>, _params: &FunctionCloseParams) -> Result<()> {
        let func = ctx.accounts.function.load()?;

        if func.num_requests > 0 || func.num_routines > 0 {
            return Err(error!(SwitchboardError::FunctionCloseNotReady));
        }

        Ok(())
    }

    pub fn actuate(ctx: &mut Context<Self>, _params: &FunctionCloseParams) -> Result<()> {
        let func = ctx.accounts.function.load()?;

        ctx.accounts.escrow_wallet.remove_resource()?;

        let address_lookup_data: &[u8] =
            &mut ctx.accounts.address_lookup_table.try_borrow_data()?;
        let address_lookup_table = AddressLookupTable::deserialize(address_lookup_data)
            .map_err(|_| error!(SwitchboardError::IllegalExecuteAttempt))?;

        let deactivation_slot = address_lookup_table.meta.deactivation_slot;
        let slot = Clock::get()?.slot;

        if deactivation_slot < slot {
            // close the address lookup table
            invoke_signed(
                &close_lookup_table(
                    ctx.accounts.address_lookup_table.key(),
                    ctx.accounts.function.key(),
                    ctx.accounts.sol_dest.key(),
                ),
                &vec![
                    ctx.accounts.address_lookup_table.to_account_info(),
                    ctx.accounts.function.to_account_info(),
                    ctx.accounts.sol_dest.to_account_info(),
                    ctx.accounts.address_lookup_program.to_account_info(),
                ][..],
                &[&[
                    FUNCTION_SEED,
                    &func.creator_seed,
                    &func.created_at_slot.to_le_bytes(),
                    &[func.bump],
                ]],
            )?;
        } else {
            msg!("address lookup table is not ready to be closed");
        }

        Ok(())
    }
}
