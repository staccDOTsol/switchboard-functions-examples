use crate::*;
use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use anchor_spl::token::Token;

#[derive(Accounts)]
#[instruction(params: ProgramInitParams)] // rpc parameters hint
pub struct ProgramInit<'info> {
    #[account(
        init,
        seeds = [STATE_SEED],
        payer = payer,
        space = SbState::size(),
        bump,
    )]
    pub state: AccountLoader<'info, SbState>,
    /// CHECK: todo
    pub authority: AccountInfo<'info>,
    #[account(mut)]
    pub token_mint: Account<'info, Mint>,
    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(address = solana_program::system_program::ID)]
    pub system_program: Program<'info, System>,
    #[account(address = anchor_spl::token::ID)]
    pub token_program: Program<'info, Token>,
    pub dao_mint: Account<'info, Mint>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct ProgramInitParams {
    pub state_bump: u8,
}
impl ProgramInit<'_> {
    pub fn validate(&self, _ctx: &Context<Self>, _params: &ProgramInitParams) -> Result<()> {
        Ok(())
    }

    pub fn actuate(ctx: &Context<Self>, params: &ProgramInitParams) -> Result<()> {
        let mut state = ctx.accounts.state.load_init()?;
        *state = SbState {
            token_mint: ctx.accounts.token_mint.key(),
            token_vault: ctx.accounts.vault.key(),
            authority: ctx.accounts.authority.key(),
            dao_mint: ctx.accounts.dao_mint.key(),
            ..Default::default()
        };
        drop(state);
        let cpi_accounts = SetAuthority {
            account_or_mint: ctx.accounts.vault.to_account_info(),
            current_authority: ctx.accounts.payer.to_account_info(),
        };
        token::set_authority(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                cpi_accounts,
                &[&[STATE_SEED, &[params.state_bump]]],
            ),
            AuthorityType::AccountOwner,
            Some(ctx.accounts.state.key()),
        )?;
        Ok(())
    }
}
