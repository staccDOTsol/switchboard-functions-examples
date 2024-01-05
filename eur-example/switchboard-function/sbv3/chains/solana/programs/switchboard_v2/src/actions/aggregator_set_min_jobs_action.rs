use crate::*;

use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(params: AggregatorSetMinJobsParams)] // rpc parameters hint
pub struct AggregatorSetMinJobs<'info> {
    #[account(mut, has_one = authority @ SwitchboardError::InvalidAuthorityError)]
    pub aggregator: AccountLoader<'info, AggregatorAccountData>,
    pub authority: Signer<'info>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct AggregatorSetMinJobsParams {
    min_job_results: u32,
}
impl AggregatorSetMinJobs<'_> {
    pub fn validate(
        &self,
        _ctx: &Context<Self>,
        params: &AggregatorSetMinJobsParams,
    ) -> Result<()> {
        if params.min_job_results < 1 {
            return Err(error!(SwitchboardError::AggregatorInvalidBatchSizeError));
        }
        Ok(())
    }

    pub fn actuate(
        ctx: &Context<AggregatorSetMinJobs>,
        params: &AggregatorSetMinJobsParams,
    ) -> Result<()> {
        let aggregator = &mut ctx.accounts.aggregator.load_mut()?;
        aggregator.min_job_results = params.min_job_results;
        Ok(())
    }
}
