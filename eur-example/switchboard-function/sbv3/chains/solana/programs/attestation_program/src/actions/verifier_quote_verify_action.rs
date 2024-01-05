use crate::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(params: VerifierQuoteVerifyParams)] // rpc parameters hint
pub struct VerifierQuoteVerify<'info> {
    #[account(
        mut,
        has_one = attestation_queue,
        constraint = quote.key().as_ref() != verifier.key().as_ref() @ SwitchboardError::InvalidSelfVerifyRequest,
    )]
    pub quote: AccountLoader<'info, VerifierAccountData>,

    #[account(
        has_one = attestation_queue,
        constraint = verifier.load()?.enclave.enclave_signer == enclave_signer.key(),
    )]
    pub verifier: AccountLoader<'info, VerifierAccountData>,

    pub enclave_signer: Signer<'info>,

    pub attestation_queue: AccountLoader<'info, AttestationQueueAccountData>,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct VerifierQuoteVerifyParams {
    pub timestamp: i64,
    pub mr_enclave: [u8; 32],
    pub idx: u32,
}

impl VerifierQuoteVerify<'_> {
    pub fn validate(&self, ctx: &Context<Self>, params: &VerifierQuoteVerifyParams) -> Result<()> {
        let clock = Clock::get()?;

        // Check if verifier was given a valid timestamp. Machine clock
        // can't be verified by enclave so we check it on chain that it was
        // honest.
        if (params.timestamp - clock.unix_timestamp).abs() > 60 {
            return Err(error!(SwitchboardError::InvalidTimestamp));
        }

        let queue = ctx.accounts.attestation_queue.load()?;
        let verifier = ctx.accounts.verifier.load()?;

        if verifier.enclave.verification_status == VerificationStatus::VerificationOverride as u8 {
            return Ok(());
        }

        verifier.verify(&clock)?;

        if !queue.has_mr_enclave(&verifier.enclave.mr_enclave) {
            return Err(error!(SwitchboardError::InvalidQuote));
        }
        if queue.data[params.idx as usize] != ctx.accounts.verifier.key() {
            return Err(error!(SwitchboardError::InvalidVerifierIdx));
        }

        Ok(())
    }

    pub fn actuate(ctx: &Context<Self>, params: &VerifierQuoteVerifyParams) -> Result<()> {
        let queue = ctx.accounts.attestation_queue.load()?;
        let mut quote = ctx.accounts.quote.load_mut()?;
        let clock = Clock::get()?;

        quote
            .enclave
            .mr_enclave
            .clone_from_slice(&params.mr_enclave);
        quote.enclave.verification_status = VerificationStatus::VerificationSuccess as u8;
        quote.enclave.verification_timestamp = clock.unix_timestamp;
        quote.enclave.valid_until = clock.unix_timestamp + queue.max_quote_verification_age;

        // If the verifier was verified through override, make the new
        // onboarded oracle upgrade the override to a success
        let _verifier = ctx.accounts.verifier.load()?;
        // if verifier.verification_status == VerificationStatus::VerificationOverride as u8 {
        // emit!(VerifierQuoteVerifyRequestEvent {
        // quote: ctx.accounts.verifier.key(),
        // verifier: ctx.accounts.quote.key(),
        // });
        // }

        emit!(VerifierQuoteVerifyEvent {
            quote: ctx.accounts.quote.key(),
            queue: ctx.accounts.attestation_queue.key(),
            verifier: ctx.accounts.verifier.key(),
        });

        Ok(())
    }
}
