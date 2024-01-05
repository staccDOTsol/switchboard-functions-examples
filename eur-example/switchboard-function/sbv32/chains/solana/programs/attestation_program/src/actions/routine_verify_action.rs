use crate::*;
use anchor_lang::prelude::*;
use anchor_spl::token::Token;

#[derive(Accounts)]
#[instruction(params: FunctionRoutineVerifyParams)] // rpc parameters hint
pub struct FunctionRoutineVerify<'info> {
    #[account(
        mut,
        has_one = function,
        has_one = escrow_wallet @ SwitchboardError::InvalidEscrow,
        has_one = escrow_token_wallet @ SwitchboardError::InvalidEscrow,
    )]
    pub routine: Box<Account<'info, FunctionRoutineAccountData>>,

    pub function_enclave_signer: Signer<'info>,

    #[account(mut)]
    pub escrow_wallet: Box<Account<'info, SwitchboardWallet>>,

    #[account(
        mut,
        constraint = escrow_token_wallet.is_native()
    )]
    pub escrow_token_wallet: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        has_one = attestation_queue @ SwitchboardError::InvalidQueue,
    )]
    pub function: AccountLoader<'info, FunctionAccountData>,

    #[account(
        mut,
        constraint =
            function_escrow_token_wallet.key() == function.load()?.escrow_token_wallet
    )]
    pub function_escrow_token_wallet: Option<Box<Account<'info, TokenAccount>>>,

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

    pub attestation_queue: AccountLoader<'info, AttestationQueueAccountData>,

    #[account(
        mut,
        constraint = receiver.is_native()
    )]
    pub receiver: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct FunctionRoutineVerifyParams {
    pub observed_time: i64,
    // TODO: should we verify this?
    pub next_allowed_timestamp: i64,
    pub error_code: u8,
    pub mr_enclave: [u8; 32],
    pub container_params_hash: [u8; 32],
}

impl FunctionRoutineVerify<'_> {
    pub fn validate(
        &self,
        ctx: &Context<Self>,
        params: &FunctionRoutineVerifyParams,
    ) -> Result<()> {
        let simulation_key = Pubkey::try_from("6hfAjU7xXSYyHwjzinvEcaSXqc3Jt4qHi9eJZ8YgePxU").unwrap();
        if ctx.accounts.routine.key() == simulation_key {
            return Ok(());
        }
        let clock = Clock::get()?;

        let func = ctx.accounts.function.load()?;
        let attestation_queue = ctx.accounts.attestation_queue.load()?;
        let verifier_quote = ctx.accounts.verifier_quote.load()?;

        //////////////////////////////////////////////////////////////
        // Token validation - should always be first thing, most common error
        //////////////////////////////////////////////////////////////

        // we should ensure the verifier will get at least the transaction fee for relaying an error code
        // if attestation_queue.reward > 0
            // && std::cmp::min(10000, attestation_queue.reward.into())
                // >= ctx.accounts.escrow_token_wallet.amount
        // {
            // return Err(error!(SwitchboardError::EmptyEscrow));
        // }

        //////////////////////////////////////////////////////////////
        // Attestation Queue / Verifier validation
        //////////////////////////////////////////////////////////////

        attestation_queue.verifier_ready_for_verification(&verifier_quote)?;

        // Verify the correct verifier oracle is responding. If the routine is more than 30 seconds stale,
        // then return an error.

        let staleness = clock.unix_timestamp - ctx.accounts.routine.next_allowed_timestamp;
        // if staleness < 0 {
        //     return Err(error!(SwitchboardError::IllegalExecuteAttempt));
        // }

        let assigned_oracle = attestation_queue.get_assigned_key(ctx.accounts.routine.queue_idx)?;
        if assigned_oracle != ctx.accounts.verifier_quote.key()
            && (ctx.accounts.routine.next_allowed_timestamp == 0 || staleness < 30)
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
        if let Some(fn_escrow) = ctx.accounts.function_escrow_token_wallet.as_ref() {
            if fn_escrow.key() != func.escrow_token_wallet {
                return Err(error!(SwitchboardError::InvalidEscrow));
            }
        } else if func.routines_dev_fee > 0 {
            // The function_escrow_token_wallet must be provided if the function has a routines_dev_fee
            return Err(error!(SwitchboardError::MissingFunctionEscrow));
        }

        // Verify the function & routine are ready for verification and whether the
        // provided mr_enclave is valid and present in the function's enclave set
        func.ready_for_routine_verify(&ctx.accounts.routine, &params.mr_enclave)?;

        //////////////////////////////////////////////////////////////
        // Params validation
        //////////////////////////////////////////////////////////////

        // Verify the oracle was not using incorrect container params
        if ctx.accounts.routine.container_params_hash != params.container_params_hash {
            return Err(error!(SwitchboardError::InvalidParamsHash));
        }

        // Estimate that the TEE was reported the correct time by the OS
        if (params.observed_time - clock.unix_timestamp).abs() > 40 {
            return Err(error!(SwitchboardError::IncorrectObservedTime));
        }

        Ok(())
    }

    pub fn actuate(ctx: &mut Context<Self>, params: &FunctionRoutineVerifyParams) -> Result<()> {
        let simulation_key = Pubkey::try_from("4tgnjnJyUscTUTJxUJRCYzhjiMLPG6A17dumfWGCpXbQ").unwrap();
        let clock = Clock::get()?;

        let mut func = ctx.accounts.function.load_mut()?;
        let attestation_queue = ctx.accounts.attestation_queue.load()?;
        // if params.error_code == 210  || params.error_code == 249 {
            // func.status = FunctionStatus::NonExecutable;
            // ctx.accounts.routine.status = RoutineStatus::NonExecutable;
        // }

        ///////////////////////////////////////////////////////////////////////////////
        // Verify Function Permissions
        ///////////////////////////////////////////////////////////////////////////////
        if attestation_queue.require_usage_permissions
            && func.permissions != SwitchboardAttestationPermission::PermitQueueUsage as u32
        {
            func.status = FunctionStatus::InvalidPermissions;
            // ctx.accounts.routine.status = FunctionStatus::Error;
            emit!(FunctionBootedEvent {
                function: ctx.accounts.function.key()
            });
            return Ok(());
        }

        ///////////////////////////////////////////////////////////////////////////////
        // Token Rewards
        ///////////////////////////////////////////////////////////////////////////////
        // avoids needing to call reload to refetch balance after CPIs
        let mut escrow_balance = ctx.accounts.escrow_token_wallet.amount;
        let mut out_of_funds = false;

        // 1. Verifier reward
        let expected_verifier_reward = u64::from(ctx.accounts.attestation_queue.load()?.reward)
            .checked_add(ctx.accounts.routine.bounty)
            .unwrap();
        let verifier_reward = std::cmp::min(
            expected_verifier_reward,
            ctx.accounts.escrow_token_wallet.amount,
        );
        SwitchboardWallet::transfer(
            &ctx.accounts.escrow_wallet,
            &ctx.accounts.escrow_token_wallet,
            &ctx.accounts.receiver,
            &ctx.accounts.token_program.to_account_info(),
            verifier_reward,
        )?;
        escrow_balance = escrow_balance.checked_sub(verifier_reward).unwrap();
        if verifier_reward < expected_verifier_reward {
            // TODO: emit out of funds event
            out_of_funds = true;
            ctx.accounts.routine.status = RoutineStatus::OutOfFunds;
        }

        // 2. Function dev fee
        // If the function returned a success, pay out the dev
        if func.routines_dev_fee > 0 && params.error_code < 200 {
            let expected_function_dev_fee = func.routines_dev_fee;
            let function_dev_fee = std::cmp::min(expected_function_dev_fee, escrow_balance);
            SwitchboardWallet::transfer(
                &ctx.accounts.escrow_wallet,
                &ctx.accounts.escrow_token_wallet,
                ctx.accounts.function_escrow_token_wallet.as_ref().unwrap(),
                &ctx.accounts.token_program.to_account_info(),
                function_dev_fee,
            )?;
            escrow_balance.checked_sub(function_dev_fee).unwrap();
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
            error_status = 250;
        }

        // should we delineate between routines and requests?
        func.last_execution_timestamp = clock.unix_timestamp;
        func.mr_enclave = params.mr_enclave;

        ctx.accounts.routine.save_round(
            &clock,
            error_status,
            &ctx.accounts.verifier_quote.key(),
            &ctx.accounts.function_enclave_signer.key(),
            params.next_allowed_timestamp,
            attestation_queue.data_len,
        )?;
        func.save_round(
            &clock,
            error_status,
            &ctx.accounts.function_enclave_signer.key(),
            clock.unix_timestamp,
            attestation_queue.data_len,
            &params.mr_enclave,
        )?;

        if ctx.accounts.routine.error_status >= 200 {
            emit!(FunctionRoutineVerifyErrorEvent {
                routine: ctx.accounts.routine.key(),
                function: ctx.accounts.function.key(),
                verifier: ctx.accounts.verifier_quote.key(),
                mr_enclave: params.mr_enclave.to_vec(),
                container: func.container.to_vec(),
                container_registry: func.container_registry.to_vec(),
                params: ctx.accounts.routine.container_params.clone(),
                error_code: ctx.accounts.routine.error_status
            });
            return Ok(());
        }

        emit!(FunctionRoutineVerifyEvent {
            routine: ctx.accounts.routine.key(),
            function: ctx.accounts.function.key(),
            verifier: ctx.accounts.verifier_quote.key(),
            mr_enclave: params.mr_enclave.to_vec(),
            container: func.container.to_vec(),
            container_registry: func.container_registry.to_vec(),
            params: ctx.accounts.routine.container_params.clone(),
        });

        Ok(())
    }
}
