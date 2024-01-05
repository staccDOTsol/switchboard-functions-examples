use crate::*;
use anchor_lang::Key;

use solana_program::hash::Hasher;
use std::convert::TryInto;

use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct AggregatorAddJob<'info> {
    #[account(mut, has_one = authority @ SwitchboardError::InvalidAuthorityError)]
    pub aggregator: AccountLoader<'info, AggregatorAccountData>,
    pub authority: Signer<'info>,
    #[account(mut)]
    pub job: Account<'info, JobAccountData>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct AggregatorAddJobParams {
    pub weight: Option<u8>,
}
impl AggregatorAddJob<'_> {
    pub fn validate(&self, ctx: &Context<Self>, _params: &AggregatorAddJobParams) -> Result<()> {
        let aggregator = ctx.accounts.aggregator.load()?;
        if aggregator.job_pubkeys_data.len() <= aggregator.job_pubkeys_size.try_into().unwrap() {
            return Err(error!(SwitchboardError::ArrayOverflowError));
        }
        if aggregator.is_locked {
            return Err(error!(SwitchboardError::AggregatorLockedError));
        }
        if ctx.accounts.job.expiration > 0 && ctx.accounts.job.expiration < aggregator.expiration {
            return Err(error!(SwitchboardError::InvalidExpirationError));
        }
        if !ctx.accounts.job.is_ready() {
            return Err(error!(SwitchboardError::JobNotInitialized));
        }
        Ok(())
    }

    pub fn actuate(
        ctx: &mut Context<AggregatorAddJob>,
        params: &AggregatorAddJobParams,
    ) -> Result<()> {
        let job = &mut ctx.accounts.job;
        let mut aggregator = ctx.accounts.aggregator.load_mut()?;
        let idx = aggregator.job_pubkeys_size as usize;
        aggregator.job_pubkeys_size += 1;
        aggregator.job_pubkeys_data[idx] = job.key();
        aggregator.job_weights[idx] = params.weight.unwrap_or(1);
        aggregator.job_hashes[idx] = Hash { data: job.hash };
        let job_hashes = &aggregator.job_hashes[..aggregator.job_pubkeys_size as usize];
        let mut hasher = Hasher::default();
        for hash in job_hashes {
            hasher.hash(&hash.data);
        }
        let checksum = hasher.result().to_bytes();
        aggregator.jobs_checksum.clone_from_slice(&checksum);
        job.reference_count = job.reference_count.checked_add(1).unwrap();
        emit!(AggregatorAddJobEvent {
            feed_pubkey: ctx.accounts.aggregator.key(),
            job_pubkey: ctx.accounts.job.key(),
        });
        Ok(())
    }
}
