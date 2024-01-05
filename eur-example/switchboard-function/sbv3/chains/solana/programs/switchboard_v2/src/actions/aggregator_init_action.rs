use crate::*;

use anchor_lang::prelude::*;

const MAX_BATCH_SIZE: u32 = 8;

#[derive(Accounts)]
#[instruction(params: AggregatorInitParams)] // rpc parameters hint
pub struct AggregatorInit<'info> {
    #[account(zero)]
    pub aggregator: AccountLoader<'info, AggregatorAccountData>,
    /// CHECK: todo
    pub authority: AccountInfo<'info>,
    pub queue: AccountLoader<'info, OracleQueueAccountData>,
    #[account(seeds = [STATE_SEED], bump = params.state_bump)]
    pub program_state: AccountLoader<'info, SbState>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct AggregatorInitParams {
    pub name: [u8; 32],
    pub metadata: [u8; 128],
    pub batch_size: u32,
    pub min_oracle_results: u32,
    pub min_job_results: u32,
    pub min_update_delay_seconds: u32,
    pub start_after: i64,
    pub variance_threshold: BorshDecimal,
    pub force_report_period: i64,
    pub expiration: i64,
    pub state_bump: u8,
    pub disable_crank: bool,
}
impl AggregatorInit<'_> {
    pub fn validate(&self, ctx: &Context<Self>, params: &AggregatorInitParams) -> Result<()> {
        // Validate queue acount type.
        ctx.accounts.queue.load()?;
        if params.batch_size > MAX_BATCH_SIZE {
            return Err(error!(SwitchboardError::AggregatorInvalidBatchSizeError));
        }
        if params.min_oracle_results > params.batch_size {
            return Err(error!(SwitchboardError::AggregatorInvalidBatchSizeError));
        }
        if params.min_update_delay_seconds < 5 {
            return Err(error!(SwitchboardError::InvalidUpdatePeriodError));
        }
        if params.expiration < 0 {
            return Err(error!(SwitchboardError::InvalidExpirationError));
        }
        Ok(())
    }

    pub fn actuate(ctx: &Context<AggregatorInit>, params: &AggregatorInitParams) -> Result<()> {
        let variance_threshold: SwitchboardDecimal = params.variance_threshold.into();
        let aggregator = &mut ctx.accounts.aggregator.load_init()?;
        aggregator.current_round.is_closed = true;
        aggregator.latest_confirmed_round.is_closed = true;
        aggregator.queue_pubkey = ctx.accounts.queue.key();
        aggregator.set_configs(
            params.name,
            params.metadata,
            params.batch_size,
            params.min_oracle_results,
            params.min_job_results,
            params.min_update_delay_seconds,
            params.start_after,
            variance_threshold,
            params.force_report_period,
            params.expiration,
            &ctx.accounts.authority.key(),
        )?;
        aggregator.disable_crank = params.disable_crank;
        aggregator.creation_timestamp = Clock::get()?.unix_timestamp;
        emit!(AggregatorInitEvent {
            feed_pubkey: ctx.accounts.aggregator.key(),
        });
        Ok(())
    }
}
