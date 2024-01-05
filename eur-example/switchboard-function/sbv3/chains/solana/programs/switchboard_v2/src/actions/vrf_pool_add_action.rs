use crate::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(params: VrfPoolAddParams)] // rpc parameters hint
pub struct VrfPoolAdd<'info> {
    /// CHECK: anyone can push onto pool as long as authority matches
    pub authority: AccountInfo<'info>,
    #[account(
        mut,
        has_one = queue,
        has_one = authority,
    )]
    pub vrf_pool: AccountLoader<'info, VrfPoolAccountData>,
    #[account(
        mut,
        has_one = queue,
        has_one = authority,
    )]
    pub vrf_lite: AccountLoader<'info, VrfLiteAccountData>,
    pub queue: AccountLoader<'info, OracleQueueAccountData>,
    #[account(
        seeds = [
            PERMISSION_SEED,
            queue.load()?.authority.as_ref(),
            queue.key().as_ref(),
            vrf_lite.key().as_ref()
            ],
        bump = vrf_lite.load()?.permission_bump
    )]
    pub permission: AccountLoader<'info, PermissionAccountData>,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct VrfPoolAddParams {}

impl VrfPoolAdd<'_> {
    pub fn validate(&self, ctx: &Context<Self>, _params: &VrfPoolAddParams) -> Result<()> {
        let vrf = ctx.accounts.vrf_lite.load()?;
        if vrf.vrf_pool != Pubkey::default() {
            return Err(error!(SwitchboardError::VrfLiteHasExistingPool));
        }
        if !ctx.accounts.queue.load()?.unpermissioned_vrf_enabled
            && !(ctx.accounts.permission.load()?.permissions
                & SwitchboardPermission::PermitVrfRequests)
        {
            return Err(error!(SwitchboardError::PermissionDenied));
        }

        Ok(())
    }

    pub fn actuate(ctx: &mut Context<Self>, _params: &VrfPoolAddParams) -> Result<()> {
        let mut vrf_lite = ctx.accounts.vrf_lite.load_mut()?;
        vrf_lite.vrf_pool = ctx.accounts.vrf_pool.key();
        drop(vrf_lite);

        let vrf_pool_account_info = ctx.accounts.vrf_pool.to_account_info();
        let mut vrf_pool_account_data = vrf_pool_account_info.try_borrow_mut_data()?;
        let mut vrf_pool = VrfPool::new(*vrf_pool_account_data)?;
        vrf_pool.push(ctx.accounts.vrf_lite.key())?;
        let new_size = vrf_pool.size();
        drop(vrf_pool);

        emit!(VrfPoolUpdateEvent {
            queue_pubkey: ctx.accounts.queue.key(),
            vrf_pool_pubkey: ctx.accounts.vrf_pool.key(),
            vrf_pubkey: ctx.accounts.vrf_lite.key(),
            new_size: new_size as u32,
            min_interval: 0
        });

        Ok(())
    }
}
