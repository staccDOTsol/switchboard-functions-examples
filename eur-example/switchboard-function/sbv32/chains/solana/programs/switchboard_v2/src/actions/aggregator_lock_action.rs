use crate::*;

use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(params: AggregatorLockParams)] // rpc parameters hint
pub struct AggregatorLock<'info> {
    #[account(mut, has_one = authority @ SwitchboardError::InvalidAuthorityError)]
    pub aggregator: AccountLoader<'info, AggregatorAccountData>,
    pub authority: Signer<'info>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct AggregatorLockParams {}
impl AggregatorLock<'_> {
    pub fn validate(&self, _ctx: &Context<Self>, _params: &AggregatorLockParams) -> Result<()> {
        Ok(())
    }

    pub fn actuate(ctx: &Context<AggregatorLock>, _params: &AggregatorLockParams) -> Result<()> {
        let aggregator = &mut ctx.accounts.aggregator.load_mut()?;
        aggregator.is_locked = true;
        emit!(AggregatorLockEvent {
            feed_pubkey: ctx.accounts.aggregator.key(),
        });
        Ok(())
    }
}
