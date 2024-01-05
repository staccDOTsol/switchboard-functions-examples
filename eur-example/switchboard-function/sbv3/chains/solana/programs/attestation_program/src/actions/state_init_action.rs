use crate::*;

use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(params: StateInitParams)] // rpc parameters hint
pub struct StateInit<'info> {
    #[account(
        init,
        seeds = [STATE_SEED],
        space = AttestationProgramState::size(),
        payer = payer,
        bump,
    )]
    pub state: AccountLoader<'info, AttestationProgramState>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct StateInitParams {}
impl StateInit<'_> {
    pub fn validate(&self, _ctx: &Context<Self>, _params: &StateInitParams) -> Result<()> {
        Ok(())
    }

    pub fn actuate(ctx: &Context<Self>, _params: &StateInitParams) -> Result<()> {
        let mut state = ctx.accounts.state.load_init()?;
        state.bump = *ctx.bumps.get("state").unwrap();
        Ok(())
    }
}
