use crate::*;

use solana_program::hash::hash;

use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(params: JobSetDataParams)] // rpc parameters hint
pub struct JobSetData<'info> {
    #[account(mut, has_one = authority)]
    pub job: Account<'info, JobAccountData>,
    pub authority: Signer<'info>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct JobSetDataParams {
    pub data: Vec<u8>,
    pub chunk_idx: u8,
}

impl JobSetData<'_> {
    pub fn validate(&self, ctx: &Context<Self>, params: &JobSetDataParams) -> Result<()> {
        if params.chunk_idx > 7 {
            return Err(error!(SwitchboardError::JobChunksExceeded));
        }
        if ctx.accounts.job.is_initializing == 0 {
            return Err(error!(SwitchboardError::JobDataLocked));
        }
        Ok(())
    }

    pub fn actuate(ctx: &mut Context<Self>, params: &JobSetDataParams) -> Result<()> {
        let job = &mut ctx.accounts.job;

        job.load_chunk(params.chunk_idx, &params.data)?;

        // 11111111 means all chunks were loaded
        if job.is_initializing == 0b1111_1111 {
            job.is_initializing = 0;
            job.hash = hash(&job.data[..]).to_bytes();
        }

        Ok(())
    }
}
