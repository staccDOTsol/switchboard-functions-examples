use crate::*;
use anchor_lang::prelude::*;
use solana_program::hash::Hasher;

#[derive(Accounts)]
pub struct AggregatorRemoveJob<'info> {
    #[account(mut, has_one = authority
        @ SwitchboardError::InvalidAuthorityError)]
    pub aggregator: AccountLoader<'info, AggregatorAccountData>,
    pub authority: Signer<'info>,
    #[account(mut)]
    pub job: Account<'info, JobAccountData>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct AggregatorRemoveJobParams {
    pub job_idx: u32,
}
impl AggregatorRemoveJob<'_> {
    pub fn validate(&self, ctx: &Context<Self>, _params: &AggregatorRemoveJobParams) -> Result<()> {
        let aggregator = ctx.accounts.aggregator.load()?;
        if aggregator.job_pubkeys_data.is_empty() {
            return Err(error!(SwitchboardError::ArrayUnderflowError));
        }
        if aggregator.is_locked {
            return Err(error!(SwitchboardError::AggregatorLockedError));
        }
        Ok(())
    }

    pub fn actuate(
        ctx: &mut Context<AggregatorRemoveJob>,
        _params: &AggregatorRemoveJobParams,
    ) -> Result<()> {
        let job = &mut ctx.accounts.job;
        let deletion_pubkey = job.key();
        let mut aggregator = ctx.accounts.aggregator.load_mut()?;
        let idx = aggregator
            .job_pubkeys_data
            .iter()
            .position(|&p| p == deletion_pubkey)
            .ok_or(SwitchboardError::PubkeyNotFoundError)?;
        aggregator.job_pubkeys_size -= 1;
        let back_idx = aggregator.job_pubkeys_size as usize;
        aggregator.job_pubkeys_data[idx] = aggregator.job_pubkeys_data[back_idx];
        aggregator.job_weights[idx] = aggregator.job_weights[back_idx];
        aggregator.job_hashes[idx] = aggregator.job_hashes[back_idx];
        aggregator.job_pubkeys_data[back_idx] = Pubkey::default();
        aggregator.job_weights[back_idx] = 0;
        aggregator.job_hashes[back_idx] = Hash::default();
        let job_hashes = &aggregator.job_hashes[..aggregator.job_pubkeys_size as usize];
        let mut hasher = Hasher::default();
        for hash in job_hashes {
            hasher.hash(&hash.data);
        }
        let checksum = hasher.result().to_bytes();
        aggregator.jobs_checksum = checksum;
        job.reference_count = job.reference_count.saturating_sub(1);
        emit!(AggregatorRemoveJobEvent {
            feed_pubkey: ctx.accounts.aggregator.key(),
            job_pubkey: ctx.accounts.job.key(),
        });
        Ok(())
    }
}
