use crate::*;

use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(params: VrfSetCallbackParams)] // rpc parameters hint
pub struct VrfSetCallback<'info> {
    #[account(mut, has_one = authority @ SwitchboardError::InvalidAuthorityError)]
    pub vrf: AccountLoader<'info, VrfAccountData>,
    pub authority: Signer<'info>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct VrfSetCallbackParams {
    callback: Callback,
}
impl VrfSetCallback<'_> {
    pub fn validate(&self, _ctx: &Context<Self>, _params: &VrfSetCallbackParams) -> Result<()> {
        Ok(())
    }

    pub fn actuate(ctx: &Context<VrfSetCallback>, params: &VrfSetCallbackParams) -> Result<()> {
        let vrf = &mut ctx.accounts.vrf.load_mut()?;
        vrf.callback = params.callback.clone().into();

        Ok(())
    }
}
