use crate::*;

use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(params: OracleQueueSetRewardsParams)] // rpc parameters hint
pub struct OracleQueueSetRewards<'info> {
    #[account(mut, has_one = authority @ SwitchboardError::InvalidAuthorityError)]
    pub queue: AccountLoader<'info, OracleQueueAccountData>,
    pub authority: Signer<'info>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct OracleQueueSetRewardsParams {
    rewards: u64,
}
impl OracleQueueSetRewards<'_> {
    pub fn validate(
        &self,
        _ctx: &Context<Self>,
        _params: &OracleQueueSetRewardsParams,
    ) -> Result<()> {
        Ok(())
    }

    pub fn actuate(
        ctx: &Context<OracleQueueSetRewards>,
        params: &OracleQueueSetRewardsParams,
    ) -> Result<()> {
        let queue = &mut ctx.accounts.queue.load_mut()?;
        queue.reward = params.rewards;
        Ok(())
    }
}
