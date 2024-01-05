use crate::*;
use anchor_lang::prelude::*;
use anchor_spl::token::Token;

#[derive(Accounts)]
#[instruction(params: FunctionVerifyParams)] // rpc parameters hint
pub struct FunctionVerify<'info> {
    #[account(
        mut,
        seeds = [
            FUNCTION_SEED,
            function.load()?.creator_seed.as_ref(),
            &function.load()?.created_at_slot.to_le_bytes()
        ],
        bump = function.load()?.bump,
        has_one = attestation_queue @ SwitchboardError::InvalidQueue,
        has_one = escrow_token_wallet @ SwitchboardError::InvalidEscrow,
        has_one = escrow_wallet,
    )]
    pub function: AccountLoader<'info, FunctionAccountData>,

    pub function_enclave_signer: Signer<'info>,

    #[account(
        has_one = attestation_queue @ SwitchboardError::InvalidQueue,
        constraint = verifier.load()?.enclave.enclave_signer == verifier_signer.key() @ SwitchboardError::InvalidEnclaveSigner,
    )]
    pub verifier: AccountLoader<'info, VerifierAccountData>,

    pub verifier_signer: Signer<'info>,

    #[account(
        seeds = [
            PERMISSION_SEED,
            attestation_queue.load()?.authority.as_ref(),
            attestation_queue.key().as_ref(),
            verifier.key().as_ref()
        ],
        bump = verifier_permission.load()?.bump,
    )]
    pub verifier_permission: AccountLoader<'info, AttestationPermissionAccountData>,

    pub escrow_wallet: Box<Account<'info, SwitchboardWallet>>,

    #[account(
        mut,
        constraint = escrow_token_wallet.is_native()
    )]
    pub escrow_token_wallet: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = receiver.is_native()
    )]
    pub receiver: Box<Account<'info, TokenAccount>>,

    pub attestation_queue: AccountLoader<'info, AttestationQueueAccountData>,

    pub token_program: Program<'info, Token>,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct FunctionVerifyParams {
    pub observed_time: i64,
    pub next_allowed_timestamp: i64,
    pub error_code: u8,
    pub mr_enclave: [u8; 32],
}
impl FunctionVerify<'_> {
    pub fn validate(&self, ctx: &Context<Self>, params: &FunctionVerifyParams) -> Result<()> {
        // return Err(error!(SwitchboardError::MethodDeprecated));

        let clock = Clock::get()?;

        let func = ctx.accounts.function.load()?;
        let attestation_queue = ctx.accounts.attestation_queue.load()?;
        let verifier_quote = ctx.accounts.verifier.load()?;

        //////////////////////////////////////////////////////////////
        // Attestation Queue / Verifier validation
        //////////////////////////////////////////////////////////////

        attestation_queue.verifier_ready_for_verification(&verifier_quote)?;

        // Verify the correct verifier oracle is responding. If the routine is more than 30 seconds stale,
        // then return an error.
        let staleness = clock.unix_timestamp - func.next_allowed_timestamp;
        // if staleness < 0 {
        //     return Err(error!(SwitchboardError::IllegalExecuteAttempt));
        // }
        let assigned_oracle = attestation_queue.get_assigned_key(func.queue_idx)?;
        if assigned_oracle != ctx.accounts.verifier.key() && staleness < 30 {
            return Err(error!(SwitchboardError::IllegalVerifier));
        }

        //////////////////////////////////////////////////////////////
        // Function validation
        //////////////////////////////////////////////////////////////

        // Skip rest of verification if error code >= 200
        if params.error_code >= 200 {
            return Ok(());
        }

        func.ready_for_function_verify(&params.mr_enclave)?;

        //////////////////////////////////////////////////////////////
        // Params validation
        //////////////////////////////////////////////////////////////

        // Estimate that the TEE was reported the correct time by the OS
        if (params.observed_time - clock.unix_timestamp).abs() > 40 {
            return Err(error!(SwitchboardError::IncorrectObservedTime));
        }

        Ok(())
    }

    pub fn actuate(ctx: &Context<Self>, params: &FunctionVerifyParams) -> Result<()> {
        let clock = Clock::get()?;

        let mut func = ctx.accounts.function.load_mut()?;
        // if params.error_code == 210 || params.error_code == 249 {
            // func.status = FunctionStatus::NonExecutable;
        // }

        let attestation_queue = ctx.accounts.attestation_queue.load()?;

        ///////////////////////////////////////////////////////////////////////////////
        // Verify Function Permissions
        ///////////////////////////////////////////////////////////////////////////////
        if attestation_queue.require_usage_permissions
            && func.permissions != SwitchboardAttestationPermission::PermitQueueUsage as u32
        {
            func.status = FunctionStatus::InvalidPermissions;
            emit!(FunctionBootedEvent {
                function: ctx.accounts.function.key()
            });
            return Ok(());
        }

        ///////////////////////////////////////////////////////////////////////////////
        // Token Rewards
        ///////////////////////////////////////////////////////////////////////////////
        let mut out_of_funds = false;

        // 1. Verifier reward
        let expected_verifier_reward = u64::from(ctx.accounts.attestation_queue.load()?.reward);
        let verifier_reward = std::cmp::min(
            expected_verifier_reward,
            ctx.accounts.escrow_token_wallet.amount,
        );
        SwitchboardWallet::transfer(
            &ctx.accounts.escrow_wallet,
            &ctx.accounts.escrow_token_wallet,
            &ctx.accounts.receiver,
            &ctx.accounts.token_program,
            verifier_reward,
        )?;
        if verifier_reward < expected_verifier_reward {
            // TODO: emit out of funds event
            out_of_funds = true;
        }

        ///////////////////////////////////////////////////////////////////////////////
        // State Changes - handle after paying out rewards
        ///////////////////////////////////////////////////////////////////////////////
        let mut error_status = params.error_code;
        if out_of_funds {
            error_status = 250;
        }

        func.save_round(
            &clock,
            error_status,
            &ctx.accounts.function_enclave_signer.key(),
            params.next_allowed_timestamp,
            attestation_queue.data_len,
            &params.mr_enclave,
        )?;

        if func.error_status >= 200 {
            return Ok(());
        }

        emit!(FunctionVerifyEvent {
            function: ctx.accounts.function.key(),
        });

        Ok(())
    }
}
