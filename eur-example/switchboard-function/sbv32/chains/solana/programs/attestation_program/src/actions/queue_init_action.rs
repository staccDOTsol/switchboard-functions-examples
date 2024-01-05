pub use crate::switchboard_attestation_program::*;

use anchor_lang::prelude::*;

// De-incentivize spamming here.
#[derive(Accounts)]
#[instruction(params: AttestationQueueInitParams)] // rpc parameters hint
pub struct AttestationQueueInit<'info> {
    #[account(
        init,
        space = AttestationQueueAccountData::size(),
        payer = payer,
    )]
    pub queue: AccountLoader<'info, AttestationQueueAccountData>,

    /// CHECK:
    pub authority: AccountInfo<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct AttestationQueueInitParams {
    pub allow_authority_override_after: u32,
    pub require_authority_heartbeat_permission: bool,
    pub require_usage_permissions: bool,
    pub max_quote_verification_age: u32,
    pub reward: u32,
    pub node_timeout: u32,
}
impl AttestationQueueInit<'_> {
    pub fn validate(
        &self,
        _ctx: &Context<Self>,
        _params: &AttestationQueueInitParams,
    ) -> Result<()> {
        Ok(())
    }

    pub fn actuate(ctx: &Context<Self>, params: &AttestationQueueInitParams) -> Result<()> {
        let mut queue = ctx.accounts.queue.load_init()?;
        queue.authority = ctx.accounts.authority.key();
        queue.allow_authority_override_after = params.allow_authority_override_after.into();
        queue.require_authority_heartbeat_permission =
            params.require_authority_heartbeat_permission;
        queue.require_usage_permissions = params.require_usage_permissions;
        queue.max_quote_verification_age = params.max_quote_verification_age.into();
        queue.reward = params.reward;
        queue.node_timeout = params.node_timeout.into();
        emit!(QueueInitEvent {
            queue: ctx.accounts.queue.key(),
        });
        Ok(())
    }
}
