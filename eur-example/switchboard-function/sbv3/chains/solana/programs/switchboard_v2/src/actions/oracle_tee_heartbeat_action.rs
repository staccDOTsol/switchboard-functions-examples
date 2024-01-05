// use crate::utils::{Registrar, Voter, VOTER_STAKE_REGISTRY_PID};
use crate::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(params: OracleTeeHeartbeatParams)] // rpc parameters hint
pub struct OracleTeeHeartbeat<'info> {
    #[account(
        mut,
        has_one = oracle_authority @ SwitchboardError::InvalidAuthorityError,
        has_one = token_account
    )]
    pub oracle: AccountLoader<'info, OracleAccountData>,
    pub oracle_authority: Signer<'info>,
    #[account(
        constraint = token_account.mint == oracle_queue.load()?.get_mint()
    )]
    pub token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub gc_oracle: AccountLoader<'info, OracleAccountData>,
    #[account(
        mut,
        has_one = data_buffer,
        constraint = oracle.load()?.queue_pubkey == oracle_queue.key()
    )]
    pub oracle_queue: AccountLoader<'info, OracleQueueAccountData>,
    #[account(
        seeds = [
            PERMISSION_SEED,
            oracle_queue.load()?.authority.as_ref(),
            oracle_queue.key().as_ref(),
            oracle_authority.key().as_ref()
        ],
        bump = params.permission_bump
    )]
    pub permission: AccountLoader<'info, PermissionAccountData>,
    /// CHECK: todo
    #[account(mut)]
    pub data_buffer: AccountInfo<'info>,
    pub quote: Signer<'info>,
    pub program_state: AccountLoader<'info, SbState>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct OracleTeeHeartbeatParams {
    pub permission_bump: u8,
}
impl<'a> OracleTeeHeartbeat<'a> {
    pub fn validate(
        &self,
        ctx: &Ctx<'_, 'a, OracleTeeHeartbeat<'a>>,
        _params: &OracleTeeHeartbeatParams,
    ) -> Result<()> {
        let state = ctx.accounts.program_state.load()?;
        let quote_account_info = &ctx.accounts.quote;
        let data = ctx.accounts.quote.try_borrow_data()?;
        if !(ctx.accounts.permission.load()?.permissions
            & SwitchboardPermission::PermitOracleHeartbeat)
        {
            return Err(error!(SwitchboardError::PermissionDenied));
        }
        if ctx.accounts.oracle_authority.key() != ctx.accounts.quote.key() {
            return Err(error!(SwitchboardError::PermissionDenied));
        }
        assert_buffer_account(ctx.program_id, &ctx.accounts.data_buffer)?;
        VerifierAccountData::validate_quote(
            quote_account_info,
            &ctx.accounts.oracle.key(),
            &Clock::get()?,
        )?;
        let quote = VerifierAccountData::load(ctx.accounts.quote.owner, data)?;
        if !state.mr_enclaves.contains(&quote.enclave.mr_enclave) {
            return Err(error!(SwitchboardError::GenericError));
        }
        Ok(())
    }

    pub fn actuate(
        ctx: &Ctx<'_, 'a, OracleTeeHeartbeat<'a>>,
        _params: &OracleTeeHeartbeatParams,
    ) -> Result<()> {
        let mut queue = ctx.accounts.oracle_queue.load_mut()?;
        let mut oracle = ctx.accounts.oracle.load_mut()?;
        let mut buf = ctx.accounts.data_buffer.try_borrow_mut_data()?;
        let buf = OracleQueueAccountData::convert_buffer(*buf);
        let clock = Clock::get()?;
        oracle.last_heartbeat = clock.unix_timestamp;
        // Re-push oracle if booted and has permission.
        if oracle.num_in_use == 0 {
            if queue.size == queue.max_size {
                return Err(error!(SwitchboardError::QueueOperationError));
            }
            let size = queue.size as usize;
            buf[size] = ctx.accounts.oracle.key();
            queue.size += 1;
            oracle.num_in_use += 1;
        }
        // Garbage collect
        if ctx.accounts.oracle.key() != ctx.accounts.gc_oracle.key() {
            queue.try_garbage_collection(buf, &clock, &ctx.accounts.gc_oracle)?;
        }
        Ok(())
    }
}
