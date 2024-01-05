use crate::*;

use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(params: AggregatorSetForceReportPeriodParams)] // rpc parameters hint
pub struct AggregatorSetForceReportPeriod<'info> {
    #[account(mut, has_one = authority @ SwitchboardError::InvalidAuthorityError)]
    pub aggregator: AccountLoader<'info, AggregatorAccountData>,
    pub authority: Signer<'info>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct AggregatorSetForceReportPeriodParams {
    force_report_period: u32,
}
impl AggregatorSetForceReportPeriod<'_> {
    pub fn validate(
        &self,
        _ctx: &Context<Self>,
        _params: &AggregatorSetForceReportPeriodParams,
    ) -> Result<()> {
        Ok(())
    }

    pub fn actuate(
        ctx: &Context<AggregatorSetForceReportPeriod>,
        params: &AggregatorSetForceReportPeriodParams,
    ) -> Result<()> {
        let aggregator = &mut ctx.accounts.aggregator.load_mut()?;
        aggregator.force_report_period = params.force_report_period.into();
        Ok(())
    }
}
