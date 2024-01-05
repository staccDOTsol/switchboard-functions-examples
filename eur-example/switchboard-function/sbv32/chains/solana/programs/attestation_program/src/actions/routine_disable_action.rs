use crate::*;

use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(params: FunctionRoutineDisableParams)] // rpc parameters hint
pub struct FunctionRoutineDisable<'info> {
    #[account(
        mut,
        has_one = authority @ SwitchboardError::InvalidAuthority,
        has_one = function,
        has_one = attestation_queue,
    )]
    pub routine: Box<Account<'info, FunctionRoutineAccountData>>,

    #[account(
        has_one = attestation_queue,
    )]
    pub function: AccountLoader<'info, FunctionAccountData>,

    pub attestation_queue: AccountLoader<'info, AttestationQueueAccountData>,

    /// CHECK: require the authority to sign this txn
    pub authority: Option<Signer<'info>>,

    /// CHECK: require the authority to sign this txn
    pub function_authority: Option<Signer<'info>>,

    /// CHECK: require the authority to sign this txn
    pub queue_authority: Option<Signer<'info>>,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct FunctionRoutineDisableParams {
    pub enable: Option<bool>,
}

impl FunctionRoutineDisable<'_> {
    pub fn validate(
        &self,
        _ctx: &Context<Self>,
        _params: &FunctionRoutineDisableParams,
    ) -> Result<()> {
        Ok(())
    }

    pub fn actuate(ctx: &mut Context<Self>, params: &FunctionRoutineDisableParams) -> Result<()> {
        let access_level = if ctx.accounts.queue_authority.is_some() {
            ResourceLevel::Queue
        } else if ctx.accounts.function_authority.is_some() {
            ResourceLevel::Function
        } else if ctx.accounts.authority.is_some() {
            ResourceLevel::Authority
        } else {
            ResourceLevel::None
        };

        if access_level == ResourceLevel::None {
            return Err(error!(SwitchboardError::IllegalExecuteAttempt));
        }

        ctx.accounts
            .routine
            .is_disabled
            .update(&access_level, params.enable)?;

        // TODO: should we only update this if the config was actually changed?
        ctx.accounts.routine.updated_at = Clock::get()?.unix_timestamp;

        Ok(())
    }
}
