use crate::*;
use anchor_lang::Key;

use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct AggregatorSetQueue<'info> {
    #[account(mut, has_one = authority @ SwitchboardError::InvalidAuthorityError)]
    pub aggregator: AccountLoader<'info, AggregatorAccountData>,
    pub authority: Signer<'info>,
    pub queue: AccountLoader<'info, OracleQueueAccountData>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct AggregatorSetQueueParams {}
impl AggregatorSetQueue<'_> {
    pub fn validate(&self, _ctx: &Context<Self>, _params: &AggregatorSetQueueParams) -> Result<()> {
        Ok(())
    }

    pub fn actuate(
        ctx: &Context<AggregatorSetQueue>,
        _params: &AggregatorSetQueueParams,
    ) -> Result<()> {
        let mut aggregator = ctx.accounts.aggregator.load_mut()?;
        aggregator.queue_pubkey = ctx.accounts.queue.key();
        aggregator.crank_pubkey = Pubkey::default();
        Ok(())
    }
}
