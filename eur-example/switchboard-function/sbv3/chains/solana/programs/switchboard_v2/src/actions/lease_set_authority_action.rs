use crate::*;

use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(params: LeaseSetAuthorityParams)] // rpc parameters hint
pub struct LeaseSetAuthority<'info> {
    #[account(mut, has_one = withdraw_authority @ SwitchboardError::InvalidAuthorityError)]
    pub lease: AccountLoader<'info, LeaseAccountData>,
    pub withdraw_authority: Signer<'info>,
    /// CHECK: todo
    pub new_authority: AccountInfo<'info>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct LeaseSetAuthorityParams {}
impl LeaseSetAuthority<'_> {
    pub fn validate(&self, _ctx: &Context<Self>, _params: &LeaseSetAuthorityParams) -> Result<()> {
        Ok(())
    }

    pub fn actuate(
        ctx: &Context<LeaseSetAuthority>,
        _params: &LeaseSetAuthorityParams,
    ) -> Result<()> {
        let lease = &mut ctx.accounts.lease.load_mut()?;
        lease.withdraw_authority = *ctx.accounts.new_authority.key;
        Ok(())
    }
}
