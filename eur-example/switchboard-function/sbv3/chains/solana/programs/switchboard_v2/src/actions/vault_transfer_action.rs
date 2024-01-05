use crate::*;
use anchor_lang::prelude::*;
use anchor_spl::token::Token;

#[derive(Accounts)]
#[instruction(params: VaultTransferParams)] // rpc parameters hint
pub struct VaultTransfer<'info> {
    #[account(
        seeds = [STATE_SEED],
        bump = params.state_bump,
        has_one = authority,
        constraint = state.load()?.token_vault == vault.key()
    )]
    pub state: AccountLoader<'info, SbState>,
    pub authority: Signer<'info>,
    #[account(mut)]
    pub to: Account<'info, TokenAccount>,
    // TODO: change these to associated accounts of state.
    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,
    #[account(address = anchor_spl::token::ID)]
    pub token_program: Program<'info, Token>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct VaultTransferParams {
    pub state_bump: u8,
    pub amount: u64,
}
impl VaultTransfer<'_> {
    pub fn validate(&self, _ctx: &Context<Self>, _params: &VaultTransferParams) -> Result<()> {
        Ok(())
    }

    pub fn actuate(ctx: &Context<VaultTransfer>, params: &VaultTransferParams) -> Result<()> {
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_accounts = Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.to.to_account_info(),
            authority: ctx.accounts.state.to_account_info().clone(),
        };
        let bump = vec![params.state_bump];
        let seeds = [STATE_SEED, bump.as_slice()].to_vec();
        let seeds_slice = [seeds.as_slice()];
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, &seeds_slice);
        token::transfer(cpi_ctx, params.amount)?;
        Ok(())
    }
}
