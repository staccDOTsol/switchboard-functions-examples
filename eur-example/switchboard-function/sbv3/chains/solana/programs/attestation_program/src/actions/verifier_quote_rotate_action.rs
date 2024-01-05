pub use crate::switchboard_attestation_program::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(params: VerifierQuoteRotateParams)] // rpc parameters hint
pub struct VerifierQuoteRotate<'info> {
    #[account(
        mut,
        has_one = attestation_queue,
        has_one = authority
    )]
    pub verifier: AccountLoader<'info, VerifierAccountData>,

    pub authority: Signer<'info>,

    /// CHECK:
    pub enclave_signer: AccountInfo<'info>,

    #[account(mut)]
    pub attestation_queue: AccountLoader<'info, AttestationQueueAccountData>,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct VerifierQuoteRotateParams {
    pub registry_key: [u8; 64],
}

impl VerifierQuoteRotate<'_> {
    pub fn maybe_do_force_override(
        clock: &Clock,
        attestation_queue: &AttestationQueueAccountData,
        verifier: &mut VerifierAccountData,
        authority: &Pubkey,
    ) -> Result<bool> {
        // DANGER ZONE: ALLOWING FORCE OVERRIDE OF CHECKING A QUOTE ON CHAIN
        // IF THERE ARE NO VERIFIERS ACTIVELY HEARTBEATING WE NEED A WAY TO
        // KICKSTART IT LIKE THIS.
        if clock.unix_timestamp - attestation_queue.last_heartbeat
            > attestation_queue.allow_authority_override_after
            && attestation_queue.authority == *authority
            && attestation_queue.allow_authority_override_after != 0
        {
            verifier.enclave.verification_status = VerificationStatus::VerificationOverride as u8;
            verifier.enclave.verification_timestamp = clock.unix_timestamp;
            verifier.enclave.valid_until =
                clock.unix_timestamp + attestation_queue.max_quote_verification_age;
            return Ok(true);
        }

        Ok(false)
    }

    pub fn validate(
        &self,
        _ctx: &Context<Self>,
        _params: &VerifierQuoteRotateParams,
    ) -> Result<()> {
        Ok(())
    }

    pub fn actuate(ctx: &Context<Self>, params: &VerifierQuoteRotateParams) -> Result<()> {
        let mut attestation_queue = ctx.accounts.attestation_queue.load_mut()?;
        let mut verifier = ctx.accounts.verifier.load_mut()?;
        let _clock = Clock::get()?;
        verifier.enclave.enclave_signer = ctx.accounts.enclave_signer.key();
        verifier
            .enclave
            .registry_key
            .clone_from_slice(&params.registry_key);
        verifier.enclave.verification_status = VerificationStatus::VerificationPending as u8;
        verifier.enclave.valid_until = 0;
        verifier.enclave.verification_timestamp = 0;
        verifier.enclave.mr_enclave = [0; 32];

        if Self::maybe_do_force_override(
            &Clock::get()?,
            &attestation_queue,
            &mut verifier,
            ctx.accounts.authority.unsigned_key(),
        )? {
            emit!(VerifierQuoteOverrideEvent {
                verifier: ctx.accounts.verifier.key(),
                queue: ctx.accounts.attestation_queue.key(),
            });
            return Ok(());
        }

        let mut next_verifier = attestation_queue.next_n(1)?[0];
        if next_verifier == ctx.accounts.verifier.key() {
            next_verifier = attestation_queue.next_n(1)?[0];
        }

        emit!(VerifierQuoteRotateEvent {
            verifier: ctx.accounts.verifier.key(),
        });

        emit!(VerifierQuoteVerifyRequestEvent {
            quote: ctx.accounts.verifier.key(),
            verifier: next_verifier,
        });

        Ok(())
    }
}
