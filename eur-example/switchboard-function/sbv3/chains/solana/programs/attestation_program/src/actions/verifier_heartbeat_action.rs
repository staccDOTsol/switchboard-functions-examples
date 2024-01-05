use crate::*;

use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(params: VerifierHeartbeatParams)] // rpc parameters hint
pub struct VerifierHeartbeat<'info> {
    #[account(
        mut,
        has_one = attestation_queue,
        constraint = verifier.load()?.enclave.enclave_signer == verifier_signer.key(),
    )]
    pub verifier: AccountLoader<'info, VerifierAccountData>,

    pub verifier_signer: Signer<'info>,

    #[account(
        mut,
        constraint = queue_authority.key() == attestation_queue.load()?.authority
    )]
    pub attestation_queue: AccountLoader<'info, AttestationQueueAccountData>,

    /// CHECK:
    pub queue_authority: AccountInfo<'info>,

    #[account(
        mut,
        has_one = attestation_queue
    )]
    pub gc_node: AccountLoader<'info, VerifierAccountData>,

    #[account(
        seeds = [
            PERMISSION_SEED,
            attestation_queue.load()?.authority.key().as_ref(),
            attestation_queue.key().as_ref(),
            verifier.key().as_ref()
        ],
        bump = permission.load()?.bump,
    )]
    pub permission: AccountLoader<'info, AttestationPermissionAccountData>,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct VerifierHeartbeatParams {}

impl VerifierHeartbeat<'_> {
    pub fn validate(&self, ctx: &Context<Self>, _params: &VerifierHeartbeatParams) -> Result<()> {
        let clock = Clock::get()?;
        let verifier = ctx.accounts.verifier.load()?;
        let queue = ctx.accounts.attestation_queue.load()?;
        let permission = ctx.accounts.permission.load()?;
        let _queue_time_since_hb = clock.unix_timestamp - queue.last_heartbeat;
        if queue.require_authority_heartbeat_permission
            && !permission.has(SwitchboardAttestationPermission::PermitNodeheartbeat)
        {
            return Err(error!(SwitchboardError::PermissionDenied));
        }
        verifier.verify(&clock)?;
        if verifier.enclave.verification_status != VerificationStatus::VerificationOverride as u8
            && !queue.has_mr_enclave(&verifier.enclave.mr_enclave)
        {
            return Err(error!(SwitchboardError::InvalidQuote));
        }
        Ok(())
    }

    pub fn actuate(ctx: &Context<Self>, _params: &VerifierHeartbeatParams) -> Result<()> {
        let mut queue = ctx.accounts.attestation_queue.load_mut()?;
        let mut verifier = ctx.accounts.verifier.load_mut()?;

        let clock = Clock::get()?;
        verifier.last_heartbeat = clock.unix_timestamp;
        verifier.last_heartbeat = clock.unix_timestamp;

        // Re-push oracle if booted and has permission.
        if !verifier.is_on_queue.to_bool() {
            if queue.data_len as usize == queue.data.len() {
                return Err(error!(SwitchboardError::QueueFull));
            }
            let queue_len = queue.data_len as usize;
            queue.data[queue_len] = ctx.accounts.verifier.key();
            queue.data_len += 1;
            verifier.is_on_queue = true.to_u8();
        }

        // Garbage collect
        if ctx.accounts.verifier.key() != ctx.accounts.gc_node.key()
            && queue.try_garbage_collection(&clock, &ctx.accounts.gc_node)?
        {
            emit!(GarbageCollectionEvent {
                verifier: ctx.accounts.gc_node.key(),
                queue: ctx.accounts.attestation_queue.key(),
            });
        }

        emit!(VerifierHeartbeatEvent {
            verifier: ctx.accounts.verifier.key(),
            queue: ctx.accounts.attestation_queue.key(),
        });

        queue.curr_idx += 1;
        queue.curr_idx %= queue.data_len;
        Ok(())
    }
}
