use crate::*;

use anchor_lang::prelude::*;
use solana_program::clock;

#[derive(Accounts)]
#[instruction(params: FunctionSetEscrowParams)] // rpc parameters hint
pub struct FunctionSetEscrow<'info> {
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
        has_one = attestation_queue,
    )]
    pub function: AccountLoader<'info, FunctionAccountData>,

    pub authority: Signer<'info>,

    pub attestation_queue: AccountLoader<'info, AttestationQueueAccountData>,

    #[account(
        mut,
        constraint = escrow_wallet.authority == escrow_authority.key() &&
            escrow_wallet.attestation_queue == new_escrow.attestation_queue @ SwitchboardError::InvalidQueue
    )]
    pub escrow_wallet: Box<Account<'info, SwitchboardWallet>>,

    /// CHECK:
    pub escrow_authority: AccountInfo<'info>,

    #[account(
        mut,
        constraint = new_escrow.authority == new_escrow_authority.key()
            && new_escrow.token_wallet == new_escrow_token_wallet.key()
    )]
    pub new_escrow: Box<Account<'info, SwitchboardWallet>>,

    /// CHECK:
    pub new_escrow_authority: Signer<'info>,

    /// CHECK:
    pub new_escrow_token_wallet: Box<Account<'info, TokenAccount>>,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct FunctionSetEscrowParams {}

impl FunctionSetEscrow<'_> {
    pub fn validate(&self, ctx: &Context<Self>, _params: &FunctionSetEscrowParams) -> Result<()> {
        if ctx.accounts.escrow_wallet.key() == ctx.accounts.new_escrow.key() {
            return Err(error!(SwitchboardError::InvalidEscrow));
        }

        if ctx.accounts.new_escrow.attestation_queue
            != ctx.accounts.function.load()?.attestation_queue
        {
            return Err(error!(SwitchboardError::InvalidQueue));
        }

        Ok(())
    }

    pub fn actuate(ctx: &mut Context<Self>, _params: &FunctionSetEscrowParams) -> Result<()> {
        let func = &mut ctx.accounts.function.load_mut()?;

        func.updated_at = clock::Clock::get()?.unix_timestamp;

        func.escrow_wallet = ctx.accounts.new_escrow.key();
        func.escrow_token_wallet = ctx.accounts.new_escrow.token_wallet;

        func.reward_escrow_wallet = ctx.accounts.new_escrow.key();
        func.reward_escrow_token_wallet = ctx.accounts.new_escrow.token_wallet;

        ctx.accounts.escrow_wallet.remove_resource()?;
        ctx.accounts.new_escrow.add_resource()?;

        // TODO: should we extend lookup table with new wallet and token_wallet?

        Ok(())
    }
}
