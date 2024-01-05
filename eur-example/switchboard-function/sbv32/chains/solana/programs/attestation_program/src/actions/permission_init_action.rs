use crate::*;

use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(params: AttestationPermissionInitParams)] // rpc parameters hint
pub struct AttestationPermissionInit<'info> {
    #[account(
        init_if_needed,
        seeds = [
            PERMISSION_SEED,
            authority.key().as_ref(),
            attestation_queue.key().as_ref(),
            node.key().as_ref()
        ],
        space = AttestationPermissionAccountData::size(),
        payer = payer,
        bump,
    )]
    pub permission: AccountLoader<'info, AttestationPermissionAccountData>,

    /// CHECK:
    pub authority: AccountInfo<'info>,

    #[account(
        has_one = authority
    )]
    pub attestation_queue: AccountLoader<'info, AttestationQueueAccountData>,

    /// CHECK:
    pub node: AccountInfo<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct AttestationPermissionInitParams {}

impl AttestationPermissionInit<'_> {
    pub fn validate(
        &self,
        _ctx: &Context<Self>,
        _params: &AttestationPermissionInitParams,
    ) -> Result<()> {
        Ok(())
    }

    pub fn actuate(ctx: &Context<Self>, _params: &AttestationPermissionInitParams) -> Result<()> {
        if ctx.accounts.permission.load().is_ok() {
            return Ok(());
        }
        let mut permission = ctx.accounts.permission.load_init()?;
        permission.authority = ctx.accounts.authority.key();
        permission.granter = ctx.accounts.attestation_queue.key();
        permission.grantee = ctx.accounts.node.key();
        permission.bump = *ctx.bumps.get("permission").unwrap();
        emit!(PermissionInitEvent {
            permission: ctx.accounts.permission.key(),
        });
        Ok(())
    }
}
