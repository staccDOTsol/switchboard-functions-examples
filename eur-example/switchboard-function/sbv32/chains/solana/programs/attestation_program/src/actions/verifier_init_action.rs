pub use crate::switchboard_attestation_program::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(params: VerifierInitParams)] // rpc parameters hint
pub struct VerifierInit<'info> {
    #[account(
        init,
        space = VerifierAccountData::size(),
        payer = payer
    )]
    pub verifier: AccountLoader<'info, VerifierAccountData>,

    pub attestation_queue: AccountLoader<'info, AttestationQueueAccountData>,

    /// CHECK:
    pub queue_authority: AccountInfo<'info>, // may be signer

    /// CHECK:
    pub authority: AccountInfo<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct VerifierInitParams {}

impl VerifierInit<'_> {
    pub fn validate(&self, _ctx: &Context<Self>, _params: &VerifierInitParams) -> Result<()> {
        Ok(())
    }

    pub fn actuate(ctx: &Context<Self>, _params: &VerifierInitParams) -> Result<()> {
        let mut verifier = ctx.accounts.verifier.load_init()?;
        verifier.attestation_queue = ctx.accounts.attestation_queue.key();
        verifier.authority = ctx.accounts.authority.key();
        verifier.created_at = Clock::get()?.unix_timestamp;
        verifier.enclave = Quote::default();
        verifier.enclave.verification_status = VerificationStatus::VerificationPending as u8;

        emit!(VerifierInitEvent {
            verifier: ctx.accounts.verifier.key(),
        });

        Ok(())
    }
}
