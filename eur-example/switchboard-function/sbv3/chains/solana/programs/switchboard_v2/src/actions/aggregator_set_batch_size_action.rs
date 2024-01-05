use crate::*;

use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(params: AggregatorSetBatchSizeParams)] // rpc parameters hint
pub struct AggregatorSetBatchSize<'info> {
    #[account(mut, has_one = authority @ SwitchboardError::InvalidAuthorityError)]
    pub aggregator: AccountLoader<'info, AggregatorAccountData>,
    pub authority: Signer<'info>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct AggregatorSetBatchSizeParams {
    batch_size: u32,
}
impl AggregatorSetBatchSize<'_> {
    pub fn validate(
        &self,
        _ctx: &Context<Self>,
        params: &AggregatorSetBatchSizeParams,
    ) -> Result<()> {
        if params.batch_size < 1 {
            return Err(error!(SwitchboardError::AggregatorInvalidBatchSizeError));
        }
        if params.batch_size > 10 {
            return Err(error!(SwitchboardError::AggregatorInvalidBatchSizeError));
        }
        Ok(())
    }

    pub fn actuate(
        ctx: &Context<AggregatorSetBatchSize>,
        params: &AggregatorSetBatchSizeParams,
    ) -> Result<()> {
        let aggregator = &mut ctx.accounts.aggregator.load_mut()?;
        aggregator.oracle_request_batch_size = params.batch_size;
        Ok(())
    }
}
