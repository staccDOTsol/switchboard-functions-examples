use crate::*;

use anchor_lang::prelude::*;
use solana_program::clock;

#[derive(Accounts)]
#[instruction(params: FunctionSetAuthorityParams)] // rpc parameters hint
pub struct FunctionSetAuthority<'info> {
    #[account(
        mut,
        seeds = [
            FUNCTION_SEED,
            function.load()?.creator_seed.as_ref(),
            &function.load()?.created_at_slot.to_le_bytes()
        ],
        bump = function.load()?.bump,
        has_one = authority @ SwitchboardError::InvalidAuthority,
        has_one = escrow_wallet,
    )]
    pub function: AccountLoader<'info, FunctionAccountData>,

    pub authority: Signer<'info>,

    pub attestation_queue: AccountLoader<'info, AttestationQueueAccountData>,

    #[account(
        mut,
        constraint = escrow_wallet.authority == escrow_authority.key()
    )]
    pub escrow_wallet: Box<Account<'info, SwitchboardWallet>>,

    /// CHECK:
    pub escrow_authority: AccountInfo<'info>,

    /// CHECK:
    pub new_authority: AccountInfo<'info>,

    pub wallet_authority: Option<Signer<'info>>,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct FunctionSetAuthorityParams {}

impl FunctionSetAuthority<'_> {
    pub fn validate(
        &self,
        ctx: &Context<Self>,
        _params: &FunctionSetAuthorityParams,
    ) -> Result<()> {
        if ctx.accounts.escrow_wallet.authority == ctx.accounts.new_authority.key()
            && ctx.accounts.wallet_authority.is_none()
        {
            return Err(error!(SwitchboardError::PermissionDenied));
        }

        if ctx.accounts.escrow_wallet.authority != ctx.accounts.authority.key() {
            return Err(error!(SwitchboardError::PermissionDenied));
        }

        Ok(())
    }

    pub fn actuate(ctx: &mut Context<Self>, _params: &FunctionSetAuthorityParams) -> Result<()> {
        let func = &mut ctx.accounts.function.load_mut()?;
        func.updated_at = clock::Clock::get()?.unix_timestamp;
        func.authority = ctx.accounts.new_authority.key();

        // TODO: should we extend lookup table with new authority?

        Ok(())
    }
}
