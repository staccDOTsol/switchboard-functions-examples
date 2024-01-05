use crate::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(params: VrfPoolRemoveParams)] // rpc parameters hint
pub struct VrfPoolRemove<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        has_one = queue,
        has_one = authority,
    )]
    pub vrf_pool: AccountLoader<'info, VrfPoolAccountData>,
    pub queue: AccountLoader<'info, OracleQueueAccountData>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct VrfPoolRemoveParams {}

impl VrfPoolRemove<'_> {
    pub fn validate(&self, ctx: &Context<Self>, _params: &VrfPoolRemoveParams) -> Result<()> {
        if ctx.accounts.vrf_pool.load()?.size == 0 {
            return Err(error!(SwitchboardError::VrfPoolEmpty));
        }
        Ok(())
    }

    pub fn actuate(ctx: &mut Context<Self>, _params: &VrfPoolRemoveParams) -> Result<()> {
        let vrf_pool_pubkey = ctx.accounts.vrf_pool.key();
        let vrf_pool_account_info = ctx.accounts.vrf_pool.to_account_info();
        let mut vrf_pool_account_data = vrf_pool_account_info.try_borrow_mut_data()?;
        let mut vrf_pool = VrfPool::new(*vrf_pool_account_data)?;

        let row = vrf_pool.pop()?;
        let new_size = vrf_pool.size();
        drop(vrf_pool);

        let vrf_idx = ctx
            .remaining_accounts
            .iter()
            .position(|a| a.key() == row.pubkey)
            .ok_or(error!(SwitchboardError::VrfAccountNotFound))
            .unwrap();

        let vrf_account = ctx.remaining_accounts[vrf_idx].to_account_info();
        let vrf_loader = AccountLoader::<'_, VrfLiteAccountData>::try_from(&vrf_account)?;
        let vrf_lite_pubkey = vrf_loader.key();
        let mut vrf = vrf_loader.load_mut()?;
        vrf.vrf_pool = Pubkey::default();
        drop(vrf);

        emit!(VrfPoolUpdateEvent {
            queue_pubkey: ctx.accounts.queue.key(),
            vrf_pool_pubkey,
            vrf_pubkey: vrf_lite_pubkey,
            new_size: new_size as u32,
            min_interval: 0
        });

        Ok(())
    }
}
