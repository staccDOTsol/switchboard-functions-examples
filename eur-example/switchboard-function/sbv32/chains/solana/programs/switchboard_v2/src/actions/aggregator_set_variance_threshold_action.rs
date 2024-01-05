use crate::*;

use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(params: AggregatorSetVarianceThresholdParams)] // rpc parameters hint
pub struct AggregatorSetVarianceThreshold<'info> {
    #[account(mut, has_one = authority @ SwitchboardError::InvalidAuthorityError)]
    pub aggregator: AccountLoader<'info, AggregatorAccountData>,
    pub authority: Signer<'info>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct AggregatorSetVarianceThresholdParams {
    variance_threshold: BorshDecimal,
}
impl AggregatorSetVarianceThreshold<'_> {
    pub fn validate(
        &self,
        _ctx: &Context<Self>,
        _params: &AggregatorSetVarianceThresholdParams,
    ) -> Result<()> {
        Ok(())
    }

    pub fn actuate(
        ctx: &Context<AggregatorSetVarianceThreshold>,
        params: &AggregatorSetVarianceThresholdParams,
    ) -> Result<()> {
        let aggregator = &mut ctx.accounts.aggregator.load_mut()?;
        aggregator.variance_threshold = params.variance_threshold.into();
        Ok(())
    }
}
