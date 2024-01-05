pub use crate::switchboard_attestation_program::*;

use anchor_lang::prelude::*;

// De-incentivize spamming here.
#[derive(Accounts)]
#[instruction(params: AttestationQueueRemoveMrEnclaveParams)] // rpc parameters hint
pub struct AttestationQueueRemoveMrEnclave<'info> {
    #[account(mut, has_one = authority)]
    pub queue: AccountLoader<'info, AttestationQueueAccountData>,
    pub authority: Signer<'info>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct AttestationQueueRemoveMrEnclaveParams {
    pub mr_enclave: [u8; 32],
}
impl AttestationQueueRemoveMrEnclave<'_> {
    pub fn validate(
        &self,
        ctx: &Context<Self>,
        params: &AttestationQueueRemoveMrEnclaveParams,
    ) -> Result<()> {
        let queue = ctx.accounts.queue.load()?;
        let pos = queue
            .mr_enclaves
            .iter()
            .position(|&x| x == params.mr_enclave);
        if pos.is_none() {
            return Err(error!(SwitchboardError::MrEnclaveDoesntExist));
        }
        Ok(())
    }

    pub fn actuate(
        ctx: &Context<Self>,
        params: &AttestationQueueRemoveMrEnclaveParams,
    ) -> Result<()> {
        let mut queue = ctx.accounts.queue.load_mut()?;
        let pos = queue
            .mr_enclaves
            .iter()
            .position(|&x| x == params.mr_enclave)
            .unwrap();
        let mr_enclaves_len = queue.mr_enclaves_len as usize;
        queue.mr_enclaves[pos] = queue.mr_enclaves[mr_enclaves_len - 1];
        queue.mr_enclaves[mr_enclaves_len - 1] = Default::default();
        queue.mr_enclaves_len -= 1;
        emit!(QueueRemoveMrEnclaveEvent {
            queue: ctx.accounts.queue.key(),
            mr_enclave: params.mr_enclave,
        });
        Ok(())
    }
}
