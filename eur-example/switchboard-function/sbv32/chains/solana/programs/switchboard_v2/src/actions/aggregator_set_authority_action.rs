use crate::*;

use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(params: AggregatorSetAuthorityParams)] // rpc parameters hint
pub struct AggregatorSetAuthority<'info> {
    #[account(mut, has_one = authority @ SwitchboardError::InvalidAuthorityError)]
    pub aggregator: AccountLoader<'info, AggregatorAccountData>,
    pub authority: Signer<'info>,
    /// CHECK: todo
    pub new_authority: AccountInfo<'info>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct AggregatorSetAuthorityParams {}
impl AggregatorSetAuthority<'_> {
    pub fn validate(
        &self,
        _ctx: &Context<Self>,
        _params: &AggregatorSetAuthorityParams,
    ) -> Result<()> {
        Ok(())
    }

    pub fn actuate(
        ctx: &Context<AggregatorSetAuthority>,
        _params: &AggregatorSetAuthorityParams,
    ) -> Result<()> {
        let aggregator = &mut ctx.accounts.aggregator.load_mut()?;
        aggregator.authority = *ctx.accounts.new_authority.key;
        emit!(AggregatorSetAuthorityEvent {
            feed_pubkey: ctx.accounts.aggregator.key(),
            old_authority: ctx.accounts.authority.key(),
            new_authority: ctx.accounts.new_authority.key(),
        });
        Ok(())
    }
}
