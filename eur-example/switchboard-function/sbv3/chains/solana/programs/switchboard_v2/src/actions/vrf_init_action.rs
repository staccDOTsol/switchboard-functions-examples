use crate::*;
use anchor_lang::prelude::*;
use anchor_spl::token::Token;
use solana_program::program_option::COption;

#[derive(Accounts)]
#[instruction(params: VrfInitParams)] // rpc parameters hint
pub struct VrfInit<'info> {
    #[account(zero)]
    pub vrf: AccountLoader<'info, VrfAccountData>,
    /// CHECK: todo
    pub authority: AccountInfo<'info>,
    pub oracle_queue: AccountLoader<'info, OracleQueueAccountData>,
    #[account(mut, constraint =
        escrow.mint == oracle_queue.load()?.get_mint() &&
        escrow.owner == program_state.key() &&
        escrow.delegate == COption::None &&
        escrow.close_authority == COption::None)]
    pub escrow: Account<'info, TokenAccount>,
    #[account(seeds = [STATE_SEED], bump = params.state_bump)]
    pub program_state: AccountLoader<'info, SbState>,
    #[account(address = anchor_spl::token::ID)]
    pub token_program: Program<'info, Token>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct VrfInitParams {
    callback: Callback,
    state_bump: u8,
}
impl VrfInit<'_> {
    pub fn validate(&self, _ctx: &Context<Self>, _params: &VrfInitParams) -> Result<()> {
        Ok(())
    }

    pub fn actuate(ctx: &Context<VrfInit>, params: &VrfInitParams) -> Result<()> {
        let mut vrf = ctx.accounts.vrf.load_init()?;
        vrf.authority = ctx.accounts.authority.key();
        vrf.oracle_queue = ctx.accounts.oracle_queue.key();
        vrf.batch_size = 1;
        vrf.callback = params.callback.clone().into();
        vrf.escrow = ctx.accounts.escrow.key();
        let cpi_accounts = SetAuthority {
            account_or_mint: ctx.accounts.escrow.to_account_info().clone(),
            current_authority: ctx.accounts.program_state.to_account_info().clone(),
        };
        let state_seeds: &[&[&[u8]]] = &[&[STATE_SEED, &[params.state_bump]]];
        token::set_authority(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                cpi_accounts,
                state_seeds,
            ),
            AuthorityType::CloseAccount,
            Some(ctx.accounts.vrf.key()),
        )?;
        Ok(())
    }
}
