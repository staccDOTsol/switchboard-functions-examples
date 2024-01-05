use crate::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(params: PermissionInitParams)] // rpc parameters hint
pub struct PermissionInit<'info> {
    #[account(
        init,
        seeds = [
            PERMISSION_SEED,
            authority.key().as_ref(),
            granter.key().as_ref(),
            grantee.key().as_ref()
        ],
        bump,
        space = PermissionAccountData::size(),
        payer = payer)]
    pub permission: AccountLoader<'info, PermissionAccountData>,
    /// CHECK: todo
    pub authority: AccountInfo<'info>,
    /// CHECK: todo
    pub granter: AccountInfo<'info>,
    /// CHECK: todo
    pub grantee: AccountInfo<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(address = solana_program::system_program::ID)]
    pub system_program: Program<'info, System>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct PermissionInitParams {
    //pub permission_bump: u8,
}
impl<'info> PermissionInit<'info> {
    pub fn validate(
        &self,
        _ctx: &Context<'_, '_, '_, 'info, Self>,
        _params: &PermissionInitParams,
    ) -> Result<()> {
        Ok(())
    }

    pub fn actuate(
        ctx: &Context<'_, '_, '_, 'info, PermissionInit<'info>>,
        _params: &PermissionInitParams,
    ) -> Result<()> {
        let permission = &mut ctx.accounts.permission.load_init()?;
        permission.authority = *ctx.accounts.authority.key;
        permission.granter = *ctx.accounts.granter.key;
        permission.grantee = *ctx.accounts.grantee.key;
        permission.bump = *ctx.bumps.get("permission").unwrap();
        Ok(())
    }
}
