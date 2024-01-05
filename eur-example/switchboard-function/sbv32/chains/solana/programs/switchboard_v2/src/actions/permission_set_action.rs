use crate::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct PermissionSet<'info> {
    #[account(mut, has_one = authority @ SwitchboardError::InvalidAuthorityError)]
    pub permission: AccountLoader<'info, PermissionAccountData>,
    pub authority: Signer<'info>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct PermissionSetParams {
    pub permission: SwitchboardPermission,
    pub enable: bool,
}
impl PermissionSet<'_> {
    pub fn validate(&self, _ctx: &Context<Self>, _params: &PermissionSetParams) -> Result<()> {
        Ok(())
    }

    pub fn actuate(ctx: &Context<PermissionSet>, params: &PermissionSetParams) -> Result<()> {
        let permission = &mut ctx.accounts.permission.load_mut()?;
        permission.permissions |= params.permission as u32;
        if !params.enable {
            permission.permissions &= !(params.permission as u32);
        }
        emit!(PermissionSetEvent {
            permission_key: ctx.accounts.permission.key(),
            permission: params.permission,
            enable: params.enable,
        });
        Ok(())
    }
}
