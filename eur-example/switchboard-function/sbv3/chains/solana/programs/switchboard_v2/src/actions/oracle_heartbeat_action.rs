// use crate::utils::{Registrar, Voter, VOTER_STAKE_REGISTRY_PID};
use crate::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(params: OracleHeartbeatParams)] // rpc parameters hint
pub struct OracleHeartbeat<'info> {
    #[account(mut,
        has_one = oracle_authority @ SwitchboardError::InvalidAuthorityError,
        has_one = token_account)]
    pub oracle: AccountLoader<'info, OracleAccountData>,
    pub oracle_authority: Signer<'info>,
    #[account(constraint = token_account.mint == oracle_queue.load()?.get_mint())]
    pub token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub gc_oracle: AccountLoader<'info, OracleAccountData>,
    #[account(mut,
        has_one = data_buffer,
        constraint = oracle.load()?.queue_pubkey == oracle_queue.key())]
    pub oracle_queue: AccountLoader<'info, OracleQueueAccountData>,
    #[account(seeds = [
        PERMISSION_SEED,
        oracle_queue.load()?.authority.as_ref(),
        oracle_queue.key().as_ref(),
        oracle.key().as_ref()],
        bump = params.permission_bump)]
    pub permission: AccountLoader<'info, PermissionAccountData>,
    /// CHECK: todo
    #[account(mut)]
    pub data_buffer: AccountInfo<'info>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct OracleHeartbeatParams {
    pub permission_bump: u8,
}
impl<'a> OracleHeartbeat<'a> {
    pub fn check_voter_stake_accounts(_authority: &Pubkey, ctx: &Ctx<'_, 'a, Self>) -> Result<()> {
        if ctx.remaining_accounts.len() < 2 {
            return Err(error!(SwitchboardError::ArrayOperationError));
        }
        let _voter_account_info = &ctx.remaining_accounts[0];
        // let voter = Voter::new(&voter_account_info)?;
        // let registrar_account_info = &ctx.remaining_accounts[1];
        // let _registrar = Registrar::new(&registrar_account_info)?;
        // require!(voter.voter_authority == *authority, SwitchboardError::VoterStakeRegistryError);
        // require!(
        // voter.registrar == registrar_account_info.key(),
        // SwitchboardError::VoterStakeRegistryError
        // );
        // require!(
        // *voter_account_info.owner == VOTER_STAKE_REGISTRY_PID,
        // SwitchboardError::VoterStakeRegistryError
        // );
        // require!(
        // *registrar_account_info.owner == VOTER_STAKE_REGISTRY_PID,
        // SwitchboardError::VoterStakeRegistryError
        // );
        // require!(
        // registrar_account_info.key() == TOKEN_LOCKUP_REGISTRAR,
        // SwitchboardError::VoterStakeRegistryError
        // );
        let queue = ctx.accounts.oracle_queue.load()?;
        if queue.enable_tee_only {
            return Err(error!(SwitchboardError::PermissionDenied));
        }
        Ok(())
    }

    pub fn validate(
        &self,
        ctx: &Ctx<'_, 'a, OracleHeartbeat<'a>>,
        _params: &OracleHeartbeatParams,
    ) -> Result<()> {
        if !(ctx.accounts.permission.load()?.permissions
            & SwitchboardPermission::PermitOracleHeartbeat)
        {
            return Err(error!(SwitchboardError::PermissionDenied));
        }
        // if ctx.accounts.token_account.amount < ctx.accounts.oracle_queue.load()?.min_stake {
        // return Err(error!(SwitchboardError::InsufficientStakeError));
        // }
        assert_buffer_account(ctx.program_id, &ctx.accounts.data_buffer)?;
        let _oracle = ctx.accounts.oracle.load()?;
        let min_stake = ctx.accounts.oracle_queue.load()?.min_stake;
        if min_stake > 0 {
            // Self::check_voter_stake_accounts(&oracle.oracle_authority, ctx)?;
            // let voter_account_info = &ctx.remaining_accounts[0];
            // let voter = Voter::new(&voter_account_info)?;
            // let registrar_account_info = &ctx.remaining_accounts[1];
            // let registrar = Registrar::new(&registrar_account_info)?;
            // if voter.weight(&registrar)? < min_stake {
            // return Err(error!(SwitchboardError::InsufficientStakeError));
            // }
        }
        let _queue = ctx.accounts.oracle_queue.load()?;
        // if queue.sas_queue != Pubkey::default() {
        // return Err(error!(SwitchboardError::PermissionDenied));
        // }

        Ok(())
    }

    pub fn actuate(
        ctx: &Ctx<'_, 'a, OracleHeartbeat<'a>>,
        _params: &OracleHeartbeatParams,
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
