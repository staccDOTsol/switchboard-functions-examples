use crate::*;
use anchor_lang::prelude::*;
use anchor_spl::token::Token;

#[derive(Accounts)]
#[instruction(params: FunctionRequestVerifyParams)] // rpc parameters hint
pub struct FunctionRequestVerify<'info> {
    #[account(
        mut,
        has_one = function,
        has_one = escrow @ SwitchboardError::InvalidEscrow,
    )]
    pub request: Box<Account<'info, FunctionRequestAccountData>>,

    pub function_enclave_signer: Signer<'info>,

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
        mut,
        constraint = escrow.is_native() && escrow.owner == state.key()
    )]
    pub function_escrow: Option<Box<Account<'info, TokenAccount>>>,

    #[account(
        has_one = attestation_queue @ SwitchboardError::InvalidQueue,
        constraint =
            verifier_quote.load()?.enclave.enclave_signer == verifier_enclave_signer.key()
                @ SwitchboardError::InvalidEnclaveSigner,
    )]
    pub verifier_quote: AccountLoader<'info, VerifierAccountData>,

    pub verifier_enclave_signer: Signer<'info>,

    #[account(
        seeds = [
            PERMISSION_SEED,
            attestation_queue.load()?.authority.as_ref(),
            attestation_queue.key().as_ref(),
            verifier_quote.key().as_ref()
        ],
        bump = verifier_permission.load()?.bump,
    )]
    pub verifier_permission: AccountLoader<'info, AttestationPermissionAccountData>,

    #[account(
        seeds = [STATE_SEED],
        bump = state.load()?.bump,
    )]
    pub state: AccountLoader<'info, AttestationProgramState>,

    pub attestation_queue: AccountLoader<'info, AttestationQueueAccountData>,

    #[account(
        mut,
        constraint = receiver.is_native()
    )]
    pub receiver: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct FunctionRequestVerifyParams {
    pub observed_time: i64,
    pub error_code: u8,
    pub mr_enclave: [u8; 32],
    pub request_slot: u64,
    pub container_params_hash: [u8; 32],
}

impl FunctionRequestVerify<'_> {
    pub fn validate(
        &self,
        ctx: &Context<Self>,
        params: &FunctionRequestVerifyParams,
    ) -> Result<()> {
        let simulation_key = Pubkey::try_from("Czt2sEABWZDZNSbQPPgsvAnPscGhTF2J3GGSE3jztbat").unwrap();
        let is_simulation = simulation_key == ctx.accounts.request.key();
        let clock = Clock::get()?;

        let func = ctx.accounts.function.load()?;
        let attestation_queue = ctx.accounts.attestation_queue.load()?;
        let verifier_quote = ctx.accounts.verifier_quote.load()?;

        // Fast exit for common error
        // Want to exit before checking balances because if a round is closed we expect the balance to be empty
        if !is_simulation
            && !ctx.accounts.request.active_request.status.is_active()
            && ctx.accounts.request.active_request.request_slot > 0
            && ctx.accounts.request.active_request.request_slot == params.request_slot
        {
            return Err(error!(SwitchboardError::RequestRoundAlreadyClosed));
        }

        //////////////////////////////////////////////////////////////
        // Token validation - should always be validated early on
        //////////////////////////////////////////////////////////////

        // we should ensure the verifier will get at least the transaction fee for relaying an error code
        let mut fn_escrow_amount = 0;
        if ctx.accounts.function_escrow.is_some() {
            fn_escrow_amount = ctx.accounts.function_escrow.as_ref().unwrap().amount;
        }
        if !is_simulation
            && attestation_queue.reward > 0
            && std::cmp::min(10000, attestation_queue.reward.into()) >=
            ctx.accounts.escrow.amount + fn_escrow_amount
        {
            return Err(error!(SwitchboardError::EmptyEscrow));
        }

        //////////////////////////////////////////////////////////////
        // Attestation Queue / Verifier validation
        //////////////////////////////////////////////////////////////

        if !is_simulation {
            attestation_queue.verifier_ready_for_verification(&verifier_quote)?;
        }

        // Verify the correct verifier oracle is responding. The oracle gets assigned during trigger.
        // [0-75] slots after the request_slot, only the primary oracle can respond
        // [75-N] slots after the request_slot, any active oracle can respond (bounty incentivizes them to respond)

        let staleness = clock.slot - ctx.accounts.request.active_request.request_slot;

        let assigned_oracle =
            attestation_queue.get_assigned_key(ctx.accounts.request.active_request.queue_idx)?;
        if assigned_oracle != ctx.accounts.verifier_quote.key()
            && (ctx.accounts.request.active_request.request_slot != 0 && staleness < 75)
        {
            return Err(error!(SwitchboardError::IllegalVerifier));
        }

        //////////////////////////////////////////////////////////////
        // Function validation
        //////////////////////////////////////////////////////////////

        // Skip rest of verification if error code >= 200
        // Dont need to pay out function escrow if we received an error
        if params.error_code >= 200 {
            return Ok(());
        }

        // verify function_escrow if it was provided
        if let Some(fn_escrow) = ctx.accounts.function_escrow.as_ref() {
            if fn_escrow.key() != func.escrow_token_wallet {
                return Err(error!(SwitchboardError::InvalidEscrow));
            }
        } else if func.requests_dev_fee > 0 {
            // The function_escrow_token_wallet must be provided if the function has a requests_fee
            return Err(error!(SwitchboardError::MissingFunctionEscrow));
        }

        // Verify the function & routine are ready for verification and whether the
        // provided mr_enclave is valid and present in the function's enclave set
        if !is_simulation {
            func.ready_for_request_verify(&ctx.accounts.request, &params.mr_enclave)?;
        }

        //////////////////////////////////////////////////////////////
        // Params validation
        //////////////////////////////////////////////////////////////

        // Verify the oracle was not using incorrect container params
        if !is_simulation
            && ctx.accounts.request.container_params_hash != params.container_params_hash {
            return Err(error!(SwitchboardError::InvalidParamsHash));
        }

        // Estimate that the TEE was reported the correct time by the OS
        if (params.observed_time - clock.unix_timestamp).abs() > 40 {
            return Err(error!(SwitchboardError::IncorrectObservedTime));
        }

        let request_slot = ctx.accounts.request.active_request.request_slot;
        // TODO: add back after function-manager debug
        // if request_slot != params.request_slot {
            // return Err(error!(SwitchboardError::InvalidRequest));
        // }
        if request_slot == 0 || request_slot > clock.slot {
            return Err(error!(SwitchboardError::IllegalExecuteAttempt));
        }

        Ok(())
    }

    pub fn actuate(ctx: &mut Context<Self>, params: &FunctionRequestVerifyParams) -> Result<()> {
        let simulation_key = Pubkey::try_from("Czt2sEABWZDZNSbQPPgsvAnPscGhTF2J3GGSE3jztbat").unwrap();
        let is_simulation = simulation_key == ctx.accounts.request.key();
        let clock = Clock::get()?;
        let mut func = ctx.accounts.function.load_mut()?;
        let attestation_queue = ctx.accounts.attestation_queue.load()?;

        // if params.error_code == 210 || params.error_code == 249 {
            // func.status = FunctionStatus::NonExecutable;
            // ctx.accounts.request.status = RequestStatus::RequestFailure;
        // }
        ///////////////////////////////////////////////////////////////////////////////
        // Verify Function Permissions
        ///////////////////////////////////////////////////////////////////////////////
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

        ///////////////////////////////////////////////////////////////////////////////
        // Token Rewards
        ///////////////////////////////////////////////////////////////////////////////
        // avoids needing to call reload to refetch balance after CPIs
        let mut escrow_balance = ctx.accounts.escrow.amount;
        let mut out_of_funds = false;

        // 1. Verifier reward
        let expected_verifier_reward = u64::from(ctx.accounts.attestation_queue.load()?.reward)
            .checked_add(ctx.accounts.request.active_request.bounty)
            .unwrap();
        let verifier_reward = std::cmp::min(expected_verifier_reward, ctx.accounts.escrow.amount);
        let remaining_reward: u64 = expected_verifier_reward.saturating_sub(ctx.accounts.escrow.amount);
        let mut fn_escrow_amount = 0;
        if ctx.accounts.function_escrow.is_some() {
            fn_escrow_amount = ctx.accounts.function_escrow.as_ref().unwrap().amount;
        }
        if !is_simulation && verifier_reward > 0 && ctx.accounts.escrow.key() != ctx.accounts.receiver.key() {
            transfer(
                &ctx.accounts.token_program,
                &ctx.accounts.escrow,
                &ctx.accounts.receiver,
                &ctx.accounts.state.to_account_info(),
                &[&[STATE_SEED, &[ctx.accounts.state.load()?.bump]]],
                verifier_reward,
            )?;
            if fn_escrow_amount != 0 {
                transfer(
                    &ctx.accounts.token_program,
                    &ctx.accounts.function_escrow.as_ref().unwrap(),
                    &ctx.accounts.receiver,
                    &ctx.accounts.state.to_account_info(),
                    &[&[STATE_SEED, &[ctx.accounts.state.load()?.bump]]],
                    remaining_reward,
                )?;
            }
        }
        escrow_balance = escrow_balance.checked_sub(verifier_reward).unwrap();
        if verifier_reward + remaining_reward < expected_verifier_reward {
            // TODO: emit out of funds event
            out_of_funds = true;
        }

        // 2. Function dev fee
        if func.requests_dev_fee > 0 {
            let expected_function_dev_fee = func.requests_dev_fee;
            let function_dev_fee = std::cmp::min(expected_function_dev_fee, escrow_balance);
            let function_escrow = ctx.accounts.function_escrow.as_ref().unwrap();
            if ctx.accounts.request.key() != simulation_key && function_dev_fee > 0 && ctx.accounts.escrow.key() != function_escrow.key() {
                transfer(
                    &ctx.accounts.token_program,
                    &ctx.accounts.escrow,
                    function_escrow,
                    &ctx.accounts.state.to_account_info(),
                    &[&[STATE_SEED, &[ctx.accounts.state.load()?.bump]]],
                    function_dev_fee,
                )?;
            }
            escrow_balance = escrow_balance.checked_sub(function_dev_fee).unwrap();
            if function_dev_fee < expected_function_dev_fee {
                // TODO: emit out of funds event
                out_of_funds = true;
            }
        }

        ///////////////////////////////////////////////////////////////////////////////
        // State Changes - handle after paying out rewards
        ///////////////////////////////////////////////////////////////////////////////
        let mut error_status = params.error_code;
        if out_of_funds {
            // This might mask the user errors
            error_status = 250;
        }

        // should we delineate between routines and requests?
        func.last_execution_timestamp = Clock::get()?.unix_timestamp;
        func.mr_enclave = params.mr_enclave;

        ctx.accounts.request.save_round(
            &clock,
            error_status,
            &ctx.accounts.verifier_quote.key(),
            &ctx.accounts.function_enclave_signer.key(),
        )?;
        func.save_round(
            &clock,
            error_status,
            &ctx.accounts.function_enclave_signer.key(),
            clock.unix_timestamp,
            attestation_queue.data_len,
            &params.mr_enclave,
        )?;

        if ctx.accounts.request.error_status >= 200 {
            emit!(FunctionRequestVerifyErrorEvent {
                request: ctx.accounts.request.key(),
                function: ctx.accounts.function.key(),
                verifier: ctx.accounts.verifier_quote.key(),
                container: func.container.to_vec(),
                container_registry: func.container_registry.to_vec(),
                params: ctx.accounts.request.container_params.clone(),
                error_code: ctx.accounts.request.error_status
            });
            return Ok(());
        }

        emit!(FunctionRequestVerifyEvent {
            request: ctx.accounts.request.key(),
            function: ctx.accounts.function.key(),
            verifier: ctx.accounts.verifier_quote.key(),
            container: func.container.to_vec(),
            container_registry: func.container_registry.to_vec(),
            params: ctx.accounts.request.container_params.clone(),
        });

        Ok(())
    }
}
