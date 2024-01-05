use crate::*;

use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(params: AggregatorSetHistoryBufferParams)] // rpc parameters hint
pub struct AggregatorSetHistoryBuffer<'info> {
    #[account(mut, has_one = authority @ SwitchboardError::InvalidAuthorityError)]
    pub aggregator: AccountLoader<'info, AggregatorAccountData>,
    pub authority: Signer<'info>,
    /// CHECK: todo
    #[account(mut)]
    pub buffer: AccountInfo<'info>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct AggregatorSetHistoryBufferParams {}
impl AggregatorSetHistoryBuffer<'_> {
    pub fn validate(
        &self,
        ctx: &Context<Self>,
        _params: &AggregatorSetHistoryBufferParams,
    ) -> Result<()> {
        assert_safe_zeroed(ctx.program_id, &ctx.accounts.buffer)?;
        let aggregator = ctx.accounts.aggregator.load()?;
        if aggregator.is_locked {
            return Err(error!(SwitchboardError::AggregatorLockedError));
        }
        Ok(())
    }

    pub fn actuate(
        ctx: &Context<AggregatorSetHistoryBuffer>,
        _params: &AggregatorSetHistoryBufferParams,
    ) -> Result<()> {
        let aggregator = &mut ctx.accounts.aggregator.load_mut()?;
        ctx.accounts.buffer.try_borrow_mut_data()?[..8].clone_from_slice(BUFFER_DISCRIMINATOR);
        aggregator.history_buffer = ctx.accounts.buffer.key();
        Ok(())
    }
}
