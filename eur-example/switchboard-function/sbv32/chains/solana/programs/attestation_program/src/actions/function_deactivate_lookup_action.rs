use crate::*;
use anchor_lang::prelude::*;
use solana_address_lookup_table_program::instruction::deactivate_lookup_table;
use solana_program::program::invoke_signed;

#[derive(Accounts)]
pub struct FunctionDeactivateLookup<'info> {
    #[account(
        mut,
        seeds = [
            FUNCTION_SEED,
            function.load()?.creator_seed.as_ref(),
            &function.load()?.created_at_slot.to_le_bytes()
        ],
        bump = function.load()?.bump,
        has_one = authority,
        has_one = attestation_queue,
        has_one = address_lookup_table,
    )]
    pub function: AccountLoader<'info, FunctionAccountData>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub authority: Signer<'info>,

    pub attestation_queue: AccountLoader<'info, AttestationQueueAccountData>,

    /// CHECK: todo
    #[account(
        mut,
        owner = address_lookup_program.key(),
    )]
    pub address_lookup_table: AccountInfo<'info>,

    /// CHECK:
    #[account(
        constraint = address_lookup_program.executable,
        address = solana_address_lookup_table_program::id(),
    )]
    pub address_lookup_program: AccountInfo<'info>,
}

impl FunctionDeactivateLookup<'_> {
    pub fn actuate(ctx: &Context<Self>) -> Result<()> {
        let mut func = ctx.accounts.function.load_mut()?;
        func.status = FunctionStatus::NonExecutable;

        invoke_signed(
            &deactivate_lookup_table(
                ctx.accounts.address_lookup_table.key(),
                ctx.accounts.function.key(),
            ),
            &vec![
                ctx.accounts.address_lookup_table.to_account_info(),
                ctx.accounts.function.to_account_info(),
                ctx.accounts.address_lookup_program.to_account_info(),
            ][..],
            &[&[
                FUNCTION_SEED,
                func.creator_seed.as_ref(),
                func.created_at_slot.to_le_bytes().as_ref(),
                &[func.bump],
            ]],
        )?;

        Ok(())
    }
}
