use crate::*;

use solana_program::hash::hash;

use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(params: JobInitParams)] // rpc parameters hint
pub struct JobInit<'info> {
    #[account(init, payer = payer, space = params.size())]
    pub job: Account<'info, JobAccountData>,
    pub authority: Signer<'info>,
    #[account(seeds = [STATE_SEED], bump = params.state_bump)]
    pub program_state: AccountLoader<'info, SbState>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct JobInitParams {
    pub name: [u8; 32],
    pub expiration: i64,
    pub state_bump: u8,
    pub data: Vec<u8>,
    pub size: Option<u32>,
}
impl JobInitParams {
    pub fn size(&self) -> usize {
        let base: usize = 280;
        if self.size.is_none() {
            base + self.data.len()
        } else {
            base + self.size.unwrap() as usize
        }
    }
}

impl JobInit<'_> {
    pub fn validate(&self, _ctx: &Context<Self>, params: &JobInitParams) -> Result<()> {
        if params.expiration < 0 {
            return Err(error!(SwitchboardError::InvalidExpirationError));
        }
        if params.size.is_some() && params.size.unwrap() > 6400 {
            return Err(error!(SwitchboardError::JobSizeExceeded));
        }
        Ok(())
    }

    pub fn actuate(ctx: &mut Context<Self>, params: &JobInitParams) -> Result<()> {
        let job = &mut ctx.accounts.job;
        job.name = params.name;
        job.authority = ctx.accounts.authority.key();
        job.expiration = params.expiration;
        job.created_at = Clock::get()?.unix_timestamp;

        // if no size, clone data, and finish initializing
        if params.size.is_none() || params.size.unwrap() as usize == params.data.len() {
            job.data = params.data.clone();
            job.hash = hash(&params.data).to_bytes();
            return Ok(());
        }

        // chunking logic
        let size = params.size.unwrap();
        job.set_initial_status(size)?;

        Ok(())
    }
}
