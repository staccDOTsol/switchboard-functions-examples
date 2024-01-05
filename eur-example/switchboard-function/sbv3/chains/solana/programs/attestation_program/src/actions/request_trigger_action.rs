use crate::*;

use anchor_lang::prelude::*;
use anchor_spl::token::Token;

#[derive(Accounts)]
#[instruction(params: FunctionRequestTriggerParams)] // rpc parameters hint
pub struct FunctionRequestTrigger<'info> {
    #[account(
        mut,
        has_one = function,
        has_one = escrow @ SwitchboardError::InvalidEscrow,
        has_one = authority @ SwitchboardError::InvalidAuthority,
    )]
    pub request: Box<Account<'info, FunctionRequestAccountData>>,

    /// CHECK: the request authority must authorize new requests
    pub authority: Signer<'info>,

    #[account(
        mut,
        constraint = escrow.is_native() && escrow.owner == state.key()
    )]
    pub escrow: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        has_one = attestation_queue @ SwitchboardError::InvalidQueue,
    )]
    pub function: AccountLoader<'info, FunctionAccountData>,

    #[account(
        seeds = [STATE_SEED],
        bump = state.load()?.bump,
    )]
    pub state: AccountLoader<'info, AttestationProgramState>,

    pub attestation_queue: AccountLoader<'info, AttestationQueueAccountData>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub token_program: Program<'info, Token>,

    pub system_program: Program<'info, System>,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct FunctionRequestTriggerParams {
    pub bounty: Option<u64>,
    pub slots_until_expiration: Option<u64>,
    // TODO: maybe add param to force transfer from function escrow if authority signs
    pub valid_after_slot: Option<u64>,
}

impl FunctionRequestTrigger<'_> {
    pub fn validate(
        &self,
        ctx: &Context<Self>,
        _params: &FunctionRequestTriggerParams,
    ) -> Result<()> {
        ctx.accounts.function.load()?.ready_for_requests()?;

        // TODO: manaully validate request accounts? do they get validated if the account was already initialized?

        if ctx.accounts.request.is_round_active(&Clock::get()?) {
            return Err(error!(SwitchboardError::IllegalExecuteAttempt));
        }

        Ok(())
    }

    pub fn actuate(ctx: &mut Context<Self>, params: &FunctionRequestTriggerParams) -> Result<()> {
        let func = &mut ctx.accounts.function.load_mut()?;
        let attestation_queue = ctx.accounts.attestation_queue.load()?;
        let verifier_idx = func.increment_queue_idx(attestation_queue.data_len);
        let verifier = attestation_queue.data[verifier_idx as usize];

        if attestation_queue.require_usage_permissions
            && func.permissions != SwitchboardAttestationPermission::PermitQueueUsage as u32
        {
            func.status = FunctionStatus::InvalidPermissions;
            ctx.accounts.request.is_triggered = 0;
            ctx.accounts.request.status = RequestStatus::RequestFailure;
            emit!(FunctionBootedEvent {
                function: ctx.accounts.function.key()
            });
            return Ok(());
        }

        ctx.accounts.request.init_new_round(
            verifier,
            &Clock::get()?,
            verifier_idx,
            params.bounty,
            params.slots_until_expiration,
            params.valid_after_slot,
        )?;

        // fund the escrow with enough funds, wrapping the remaining of any missing funds
        let request_cost = u64::from(ctx.accounts.attestation_queue.load()?.reward)
            + params.bounty.unwrap_or_default()
            + func.requests_dev_fee;
        if request_cost > ctx.accounts.escrow.amount {
            let wrap_amount = request_cost
                .checked_sub(ctx.accounts.escrow.amount)
                .unwrap();

            wrap_native(
                &ctx.accounts.system_program,
                &ctx.accounts.token_program,
                &ctx.accounts.escrow.clone(),
                &ctx.accounts.payer.clone(),
                &[&[STATE_SEED, &[ctx.accounts.state.load()?.bump]]],
                wrap_amount,
            )?;
        }

        emit!(FunctionRequestTriggerEvent {
            attestation_queue: ctx.accounts.attestation_queue.key(),
            attestation_queue_authority: attestation_queue.authority,
            verifier,
            request: ctx.accounts.request.key(),
            function: ctx.accounts.function.key(),
            container: func.container.to_vec(),
            container_registry: func.container_registry.to_vec(),
            container_params: Some(ctx.accounts.request.container_params.clone()),
            container_params_hash: ctx.accounts.request.container_params_hash.to_vec(), // to verify against the rpc state
            request_slot: Clock::get()?.slot,
            bounty: ctx.accounts.request.active_request.bounty,
            expiration_slot: ctx.accounts.request.active_request.expiration_slot,
            is_init: false,
        });

        Ok(())
    }
}
