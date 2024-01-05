use crate::*;

use anchor_lang::prelude::*;

const MAX_BATCH_SIZE: u32 = 8;

#[derive(Accounts)]
#[instruction(params: AggregatorSetConfigParams)] // rpc parameters hint
pub struct AggregatorSetConfig<'info> {
    #[account(mut, has_one = authority @ SwitchboardError::InvalidAuthorityError)]
    pub aggregator: AccountLoader<'info, AggregatorAccountData>,
    pub authority: Signer<'info>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct AggregatorSetConfigParams {
    name: Option<[u8; 32]>,
    metadata: Option<[u8; 128]>,
    min_update_delay_seconds: Option<u32>,
    min_job_results: Option<u32>,
    batch_size: Option<u32>,
    min_oracle_results: Option<u32>,
    force_report_period: Option<u32>,
    variance_threshold: Option<BorshDecimal>,
    base_priority_fee: Option<u32>,
    priority_fee_bump: Option<u32>,
    priority_fee_bump_period: Option<u32>,
    max_priority_fee_multiplier: Option<u32>,
    disable_crank: Option<bool>,
}
impl AggregatorSetConfig<'_> {
    pub fn validate(&self, ctx: &Context<Self>, params: &AggregatorSetConfigParams) -> Result<()> {
        if ctx.accounts.aggregator.load()?.is_locked {
            return Err(error!(SwitchboardError::AggregatorLockedError));
        }

        if params.min_job_results.is_some() && params.min_job_results.unwrap() < 1 {
            return Err(error!(SwitchboardError::AggregatorInvalidBatchSizeError));
        }

        if params.min_oracle_results.is_some() && params.min_oracle_results.unwrap() < 1 {
            return Err(error!(SwitchboardError::AggregatorInvalidBatchSizeError));
        }

        if params.batch_size.is_some()
            && (params.batch_size.unwrap() < 1 || params.batch_size.unwrap() > MAX_BATCH_SIZE)
        {
            return Err(error!(SwitchboardError::AggregatorInvalidBatchSizeError));
        }

        Ok(())
    }

    pub fn actuate(
        ctx: &Context<AggregatorSetConfig>,
        params: &AggregatorSetConfigParams,
    ) -> Result<()> {
        let aggregator = &mut ctx.accounts.aggregator.load_mut()?;

        if let Some(name) = params.name {
            aggregator.name = name;
        }

        if let Some(metadata) = params.metadata {
            aggregator.metadata = metadata;
        }

        if let Some(min_update_delay_seconds) = params.min_update_delay_seconds {
            aggregator.min_update_delay_seconds = min_update_delay_seconds;
        }

        if let Some(min_job_results) = params.min_job_results {
            aggregator.min_job_results = min_job_results;
        }

        if let Some(batch_size) = params.batch_size {
            aggregator.oracle_request_batch_size = batch_size;
        }

        if let Some(min_oracle_results) = params.min_oracle_results {
            aggregator.min_oracle_results = min_oracle_results;
        }

        if let Some(force_report_period) = params.force_report_period {
            aggregator.force_report_period = force_report_period.into();
        }

        if let Some(variance_threshold) = params.variance_threshold {
            aggregator.variance_threshold = variance_threshold.into();
        }

        if let Some(base_priority_fee) = params.base_priority_fee {
            aggregator.base_priority_fee = base_priority_fee;
        }

        if let Some(priority_fee_bump_period) = params.priority_fee_bump_period {
            aggregator.priority_fee_bump_period = priority_fee_bump_period;
        }

        if let Some(priority_fee_bump) = params.priority_fee_bump {
            aggregator.priority_fee_bump = priority_fee_bump;
        }

        if let Some(max_priority_fee_multiplier) = params.max_priority_fee_multiplier {
            aggregator.max_priority_fee_multiplier = max_priority_fee_multiplier;
        }

        if let Some(disable_crank) = params.disable_crank {
            aggregator.disable_crank = disable_crank;
        }

        emit!(AggregatorSetConfigsEvent {
            feed_pubkey: ctx.accounts.aggregator.key(),
        });

        Ok(())
    }
}
