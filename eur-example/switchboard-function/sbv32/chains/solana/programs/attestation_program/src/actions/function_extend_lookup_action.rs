use crate::*;
use anchor_lang::prelude::*;
use solana_address_lookup_table_program::instruction::extend_lookup_table;
use solana_program::program::invoke_signed;

#[derive(Accounts)]
#[instruction(params: FunctionExtendLookupParams)] // rpc parameters hint
pub struct FunctionExtendLookup<'info> {
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

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct FunctionExtendLookupParams {
    new_addresses: Vec<Pubkey>,
}

impl FunctionExtendLookup<'_> {
    pub fn validate(
        &self,
        _ctx: &Context<Self>,
        params: &FunctionExtendLookupParams,
    ) -> Result<()> {
        if params.new_addresses.is_empty() {
            return Err(error!(SwitchboardError::IllegalExecuteAttempt));
        }
        Ok(())
    }

    pub fn actuate(ctx: &Context<Self>, params: &FunctionExtendLookupParams) -> Result<()> {
        let func = ctx.accounts.function.load()?;

        invoke_signed(
            &extend_lookup_table(
                ctx.accounts.address_lookup_table.key(),
                ctx.accounts.function.key(),
                Some(ctx.accounts.payer.key()),
                params.new_addresses.clone(),
            ),
            &vec![
                ctx.accounts.address_lookup_table.to_account_info(),
                ctx.accounts.function.to_account_info(),
                ctx.accounts.payer.to_account_info(),
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
