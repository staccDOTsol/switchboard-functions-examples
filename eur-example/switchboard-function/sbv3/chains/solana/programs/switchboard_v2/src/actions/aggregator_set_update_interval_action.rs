use crate::*;

use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(params: AggregatorSetUpdateIntervalParams)] // rpc parameters hint
pub struct AggregatorSetUpdateInterval<'info> {
    #[account(mut, has_one = authority @ SwitchboardError::InvalidAuthorityError)]
    pub aggregator: AccountLoader<'info, AggregatorAccountData>,
    pub authority: Signer<'info>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct AggregatorSetUpdateIntervalParams {
    new_interval: u32,
}
impl AggregatorSetUpdateInterval<'_> {
    pub fn validate(
        &self,
        _ctx: &Context<Self>,
        _params: &AggregatorSetUpdateIntervalParams,
    ) -> Result<()> {
        Ok(())
    }

    pub fn actuate(
        ctx: &Context<AggregatorSetUpdateInterval>,
        params: &AggregatorSetUpdateIntervalParams,
    ) -> Result<()> {
        let aggregator = &mut ctx.accounts.aggregator.load_mut()?;
        aggregator.min_update_delay_seconds = params.new_interval;
        Ok(())
    }
}
