use crate::*;

use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(params: AggregatorSetMinOraclesParams)] // rpc parameters hint
pub struct AggregatorSetMinOracles<'info> {
    #[account(mut, has_one = authority @ SwitchboardError::InvalidAuthorityError)]
    pub aggregator: AccountLoader<'info, AggregatorAccountData>,
    pub authority: Signer<'info>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct AggregatorSetMinOraclesParams {
    min_oracle_results: u32,
}
impl AggregatorSetMinOracles<'_> {
    pub fn validate(
        &self,
        _ctx: &Context<Self>,
        params: &AggregatorSetMinOraclesParams,
    ) -> Result<()> {
        if params.min_oracle_results < 1 {
            return Err(error!(SwitchboardError::AggregatorInvalidBatchSizeError));
        }
        Ok(())
    }

    pub fn actuate(
        ctx: &Context<AggregatorSetMinOracles>,
        params: &AggregatorSetMinOraclesParams,
    ) -> Result<()> {
        let aggregator = &mut ctx.accounts.aggregator.load_mut()?;
        aggregator.min_oracle_results = params.min_oracle_results;
        Ok(())
    }
}
