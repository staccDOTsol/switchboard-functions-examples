use crate::*;

use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(params: AggregatorSetResolutionModeParams)] // rpc parameters hint
pub struct AggregatorSetResolutionMode<'info> {
    #[account(
        mut, 
        has_one = authority @ SwitchboardError::InvalidAuthorityError
    )]
    pub aggregator: AccountLoader<'info, AggregatorAccountData>,
    pub authority: Signer<'info>,
    #[account(
        init_if_needed,
        seeds = [SLIDING_RESULT_SEED, aggregator.key().as_ref()],
        space = std::mem::size_of::<SlidingResultAccountData>() + 8,
        payer = payer, 
        bump
    )]
    pub sliding_window: AccountLoader<'info, SlidingResultAccountData>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(address = solana_program::system_program::ID)]
    pub system_program: Program<'info, System>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct AggregatorSetResolutionModeParams {
    mode: u8,
}
impl AggregatorSetResolutionMode<'_> {
    pub fn validate(
        &self,
        _ctx: &Context<Self>,
        _params: &AggregatorSetResolutionModeParams,
    ) -> Result<()> {
        Ok(())
    }

    pub fn actuate(
        ctx: &Context<AggregatorSetResolutionMode>,
        params: &AggregatorSetResolutionModeParams,
    ) -> Result<()> {
        let mut sw = ctx.accounts.sliding_window.load_mut();
        if sw.is_err() {
            sw = ctx.accounts.sliding_window.load_init();
        }
        sw?.bump = *ctx.bumps.get("sliding_window").unwrap();
        if params.mode == 0 {
            ctx.accounts.aggregator.load_mut()?.resolution_mode =
                AggregatorResolutionMode::ModeRoundResolution;
        } else {
            ctx.accounts.aggregator.load_mut()?.resolution_mode =
                AggregatorResolutionMode::ModeSlidingResolution;
        }
        Ok(())
    }
}
