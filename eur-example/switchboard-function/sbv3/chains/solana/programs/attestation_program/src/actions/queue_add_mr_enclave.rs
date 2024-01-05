pub use crate::switchboard_attestation_program::*;

use anchor_lang::prelude::*;

// De-incentivize spamming here.
#[derive(Accounts)]
#[instruction(params: AttestationQueueAddMrEnclaveParams)] // rpc parameters hint
pub struct AttestationQueueAddMrEnclave<'info> {
    #[account(mut, has_one = authority)]
    pub queue: AccountLoader<'info, AttestationQueueAccountData>,
    pub authority: Signer<'info>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct AttestationQueueAddMrEnclaveParams {
    pub mr_enclave: [u8; 32],
}
impl AttestationQueueAddMrEnclave<'_> {
    pub fn validate(
        &self,
        ctx: &Context<Self>,
        params: &AttestationQueueAddMrEnclaveParams,
    ) -> Result<()> {
        let queue = ctx.accounts.queue.load()?;
        for i in 0..queue.mr_enclaves_len {
            if queue.mr_enclaves[i as usize] == params.mr_enclave {
                return Err(error!(SwitchboardError::MrEnclaveAlreadyExists));
            }
        }
        if queue.mr_enclaves_len as usize == queue.mr_enclaves.len() {
            return Err(error!(SwitchboardError::MrEnclaveAtCapacity));
        }
        Ok(())
    }

    pub fn actuate(ctx: &Context<Self>, params: &AttestationQueueAddMrEnclaveParams) -> Result<()> {
        let mut queue = ctx.accounts.queue.load_mut()?;
        let mr_enclaves_len = queue.mr_enclaves_len as usize;
        queue.mr_enclaves[mr_enclaves_len] = params.mr_enclave;
        queue.mr_enclaves_len += 1;
        emit!(QueueAddMrEnclaveEvent {
            queue: ctx.accounts.queue.key(),
            mr_enclave: params.mr_enclave,
        });
        Ok(())
    }
}
