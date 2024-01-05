use crate::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(params: FunctionTriggerParams)]
pub struct FunctionTrigger<'info> {
    #[account(
        mut,
        seeds = [
            FUNCTION_SEED,
            function.load()?.creator_seed.as_ref(),
            &function.load()?.created_at_slot.to_le_bytes()
        ],
        bump = function.load()?.bump,
        has_one = authority @ SwitchboardError::InvalidAuthority,
        has_one = attestation_queue @ SwitchboardError::InvalidQueue,
    )]
    pub function: AccountLoader<'info, FunctionAccountData>,
    pub authority: Signer<'info>,
    pub attestation_queue: AccountLoader<'info, AttestationQueueAccountData>,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct FunctionTriggerParams {}

impl FunctionTrigger<'_> {
    pub fn validate(&self, ctx: &Context<Self>, _params: &FunctionTriggerParams) -> Result<()> {
        return Err(error!(SwitchboardError::MethodDeprecated));
        let func = ctx.accounts.function.load()?;
        let attestation_queue = ctx.accounts.attestation_queue.load()?;

        func.assert_permissions(attestation_queue.require_usage_permissions)?;
        // TODO: should we verify function escrow balance?
        Ok(())
    }

    pub fn actuate(ctx: &Context<Self>, _params: &FunctionTriggerParams) -> Result<()> {
        let mut func = ctx.accounts.function.load_mut()?;

        func.is_triggered = 1;
        if func.trigger_count == 0 {
            func.triggered_since = Clock::get()?.unix_timestamp;
        }
        func.trigger_count = func.trigger_count.saturating_add(1);

        emit!(FunctionTriggerEvent {
            function: ctx.accounts.function.key(),
        });

        Ok(())
    }
}
