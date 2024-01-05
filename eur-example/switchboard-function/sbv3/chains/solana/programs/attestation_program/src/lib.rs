#![allow(non_snake_case)]
#![allow(clippy::result_large_err)]
#![allow(clippy::unnecessary_mut_passed)]
#![allow(clippy::large_enum_variant)]
mod version;
pub use version::VERSION;

pub use crate::switchboard_attestation_program::*;

pub mod enums;
pub use enums::*;

pub mod error;
pub use error::*;

pub mod utils;
pub use utils::*;

pub mod event;
pub use event::*;

pub mod impls;
pub use impls::*;

pub mod actions;
pub use actions::*;

pub use anchor_lang::prelude::*;
pub use anchor_spl::token::{Token, TokenAccount};

use anchor_lang::{AnchorDeserialize, AnchorSerialize};
use anchor_spl::associated_token::AssociatedToken;

use anchor_spl::token::{self, SetAuthority};

// currently only used for adding as a pubkey to the function's lookup table
use solana_program::pubkey;
static SWITCHBOARD_PROGRAM_ID: Pubkey = pubkey!("SW1TCH7qEPTdLsDHRgPuMQjbQxKdH2aBStViMFnt64f");

declare_id!("sbattyXrzedoNATfc4L31wC9Mhxsi1BmFhTiN8gDshx");

//////////////////////////////////////////////////////////////
// PDA Seeds
//////////////////////////////////////////////////////////////

const STATE_SEED: &[u8] = b"STATE";
const FUNCTION_SEED: &[u8] = b"FunctionAccountData";
const PERMISSION_SEED: &[u8] = b"PermissionAccountData";

//////////////////////////////////////////////////////////////
// Constants
//////////////////////////////////////////////////////////////

/// The minimum number of slots before a request is considered expired.
pub const MINIMUM_USERS_NUM_SLOTS_UNTIL_EXPIRATION: u64 = 150; // 1 min at 400ms/slot

/// The default number of slots before a request expires.
pub const DEFAULT_USERS_NUM_SLOTS_UNTIL_EXPIRATION: u64 = 2250; // 15 min at 400ms/slot

/// The default container parameter length if not provided.
pub const DEFAULT_MAX_CONTAINER_PARAMS_LEN: u32 = 256;

#[derive(Accounts)]
pub struct ViewVersion {}

#[program]
pub mod switchboard_attestation_program {
    pub use super::*;

    pub type Ctx<'a, 'b, T> = Context<'a, 'a, 'a, 'b, T>;

    pub fn view_version(mut _ctx: Ctx<'_, '_, ViewVersion>) -> Result<()> {
        msg!("VERSION: {}", VERSION);

        Err(error!(SwitchboardError::GenericError))
    }

    // pub fn account_close_override<'a>(
    //     mut ctx: Ctx<'_, 'a, AccountCloseOverride<'a>>,
    // ) -> Result<()> {
    //     #[cfg(feature = "devnet")]
    //     return AccountCloseOverride::actuate(&mut ctx);

    //     #[cfg(not(feature = "devnet"))]
    //     msg!("function_override_close is only enabled on devnet");
    //     Ok(())
    // }

    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn state_init<'a>(
        mut ctx: Ctx<'_, 'a, StateInit<'a>>,
        params: StateInitParams,
    ) -> Result<()> {
        StateInit::actuate(&mut ctx, &params)
    }

    pub fn wallet_init<'a>(
        mut ctx: Ctx<'_, 'a, WalletInit<'a>>,
        params: WalletInitParams,
    ) -> Result<()> {
        WalletInit::actuate(&mut ctx, &params)
    }

    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn wallet_fund<'a>(
        mut ctx: Ctx<'_, 'a, WalletFund<'a>>,
        params: WalletFundParams,
    ) -> Result<()> {
        WalletFund::actuate(&mut ctx, &params)
    }

    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn wallet_withdraw<'a>(
        mut ctx: Ctx<'_, 'a, WalletWithdraw<'a>>,
        params: WalletWithdrawParams,
    ) -> Result<()> {
        WalletWithdraw::actuate(&mut ctx, &params)
    }

    // #[access_control(ctx.accounts.validate(&ctx, &params))]
    // pub fn wallet_close<'a>(
    //     mut ctx: Ctx<'_, 'a, WalletClose<'a>>,
    //     params: WalletCloseParams,
    // ) -> Result<()> {
    //     // TODO
    //     WalletClose::actuate(&mut ctx, &params)
    // }

    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn verifier_init<'a>(
        mut ctx: Ctx<'_, 'a, VerifierInit<'a>>,
        params: VerifierInitParams,
    ) -> Result<()> {
        VerifierInit::actuate(&mut ctx, &params)
    }

    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn verifier_quote_rotate<'a>(
        mut ctx: Ctx<'_, 'a, VerifierQuoteRotate<'a>>,
        params: VerifierQuoteRotateParams,
    ) -> Result<()> {
        VerifierQuoteRotate::actuate(&mut ctx, &params)
    }

    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn verifier_quote_verify<'a>(
        mut ctx: Ctx<'_, 'a, VerifierQuoteVerify<'a>>,
        params: VerifierQuoteVerifyParams,
    ) -> Result<()> {
        VerifierQuoteVerify::actuate(&mut ctx, &params)
    }

    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn verifier_heartbeat<'a>(
        mut ctx: Ctx<'_, 'a, VerifierHeartbeat<'a>>,
        params: VerifierHeartbeatParams,
    ) -> Result<()> {
        VerifierHeartbeat::actuate(&mut ctx, &params)
    }

    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn attestation_queue_init<'a>(
        mut ctx: Ctx<'_, 'a, AttestationQueueInit<'a>>,
        params: AttestationQueueInitParams,
    ) -> Result<()> {
        AttestationQueueInit::actuate(&mut ctx, &params)
    }

    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn attestation_queue_add_mr_enclave<'a>(
        mut ctx: Ctx<'_, 'a, AttestationQueueAddMrEnclave<'a>>,
        params: AttestationQueueAddMrEnclaveParams,
    ) -> Result<()> {
        AttestationQueueAddMrEnclave::actuate(&mut ctx, &params)
    }

    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn attestation_queue_remove_mr_enclave<'a>(
        mut ctx: Ctx<'_, 'a, AttestationQueueRemoveMrEnclave<'a>>,
        params: AttestationQueueRemoveMrEnclaveParams,
    ) -> Result<()> {
        AttestationQueueRemoveMrEnclave::actuate(&mut ctx, &params)
    }

    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn attestation_permission_init<'a>(
        mut ctx: Ctx<'_, 'a, AttestationPermissionInit<'a>>,
        params: AttestationPermissionInitParams,
    ) -> Result<()> {
        AttestationPermissionInit::actuate(&mut ctx, &params)
    }

    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn attestation_permission_set<'a>(
        mut ctx: Ctx<'_, 'a, AttestationPermissionSet<'a>>,
        params: AttestationPermissionSetParams,
    ) -> Result<()> {
        AttestationPermissionSet::actuate(&mut ctx, &params)
    }

    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn function_init<'a>(
        mut ctx: Ctx<'_, 'a, FunctionInit<'a>>,
        params: FunctionInitParams,
    ) -> Result<()> {
        FunctionInit::actuate(&mut ctx, &params)
    }

    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn function_close<'a>(
        mut ctx: Ctx<'_, 'a, FunctionClose<'a>>,
        params: FunctionCloseParams,
    ) -> Result<()> {
        FunctionClose::actuate(&mut ctx, &params)
    }

    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn function_set_config<'a>(
        mut ctx: Ctx<'_, 'a, FunctionSetConfig<'a>>,
        params: FunctionSetConfigParams,
    ) -> Result<()> {
        FunctionSetConfig::actuate(&mut ctx, &params)
    }

    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn function_set_authority<'a>(
        mut ctx: Ctx<'_, 'a, FunctionSetAuthority<'a>>,
        params: FunctionSetAuthorityParams,
    ) -> Result<()> {
        FunctionSetAuthority::actuate(&mut ctx, &params)
    }

    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn function_set_escrow<'a>(
        mut ctx: Ctx<'_, 'a, FunctionSetEscrow<'a>>,
        params: FunctionSetEscrowParams,
    ) -> Result<()> {
        FunctionSetEscrow::actuate(&mut ctx, &params)
    }

    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn function_reset_escrow<'a>(
        mut ctx: Ctx<'_, 'a, FunctionResetEscrow<'a>>,
        params: FunctionResetEscrowParams,
    ) -> Result<()> {
        FunctionResetEscrow::actuate(&mut ctx, &params)
    }

    // TODO: deprecate
    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn function_extend_lookup<'a>(
        mut ctx: Ctx<'_, 'a, FunctionExtendLookup<'a>>,
        params: FunctionExtendLookupParams,
    ) -> Result<()> {
        FunctionExtendLookup::actuate(&mut ctx, &params)
    }

    // TODO: deprecate
    pub fn function_deactivate_lookup<'a>(
        mut ctx: Ctx<'_, 'a, FunctionDeactivateLookup<'a>>,
    ) -> Result<()> {
        FunctionDeactivateLookup::actuate(&mut ctx)
    }

    /// Verifies a function was executed within an enclave and sets the enclave signer
    /// on the function account for downstream instructions to verify.
    ///
    /// # Errors
    ///
    /// * `InsufficientQueue` - If the attestation queue has no active verifier oracles
    /// * `InvalidQuote` - If the verifier oracle has an invalid or expired quote
    /// * `IncorrectMrEnclave` - If the verifiers mr_enclave is not found in the attestation queue's enclave set
    /// * `IllegalVerifier` - If the incorrect verifier has responded and the routine is less than 30 seconds stale.
    ///
    /// * `FunctionNotReady` - If the function status is not Active
    /// * `InvalidMrEnclave` - If the measured mr_enclave value is not null
    /// * `MrEnclavesEmpty` - If the function has 0 mr_enclaves whitelisted
    /// * `IncorrectMrEnclave` - If the measured mr_enclave is not found in the functions enclave set
    ///
    /// * `IncorrectObservedTime` - If the oracles observed time has drifted by 20 seconds
    ///
    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn function_verify<'a>(
        mut ctx: Ctx<'_, 'a, FunctionVerify<'a>>,
        params: FunctionVerifyParams,
    ) -> Result<()> {
        FunctionVerify::actuate(&mut ctx, &params)
    }

    // TODO: deprecate
    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn function_trigger<'a>(
        mut ctx: Ctx<'_, 'a, FunctionTrigger<'a>>,
        params: FunctionTriggerParams,
    ) -> Result<()> {
        FunctionTrigger::actuate(&mut ctx, &params)
    }

    ///////////////////////////////////////////////////////////////////
    /// Request Actions
    ///////////////////////////////////////////////////////////////////

    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn function_request_init<'a>(
        mut ctx: Ctx<'_, 'a, FunctionRequestInit<'a>>,
        params: FunctionRequestInitParams,
    ) -> Result<()> {
        FunctionRequestInit::actuate(&mut ctx, &params)
    }

    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn function_request_set_config<'a>(
        mut ctx: Ctx<'_, 'a, FunctionRequestSetConfig<'a>>,
        params: FunctionRequestSetConfigParams,
    ) -> Result<()> {
        FunctionRequestSetConfig::actuate(&mut ctx, &params)
    }

    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn function_request_trigger<'a>(
        mut ctx: Ctx<'_, 'a, FunctionRequestTrigger<'a>>,
        params: FunctionRequestTriggerParams,
    ) -> Result<()> {
        FunctionRequestTrigger::actuate(&mut ctx, &params)
    }

    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn function_request_init_and_trigger<'a>(
        mut ctx: Ctx<'_, 'a, FunctionRequestInitAndTrigger<'a>>,
        params: FunctionRequestInitAndTriggerParams,
    ) -> Result<()> {
        FunctionRequestInitAndTrigger::actuate(&mut ctx, &params)
    }

    /// Verifies a function request was executed within an enclave and sets
    /// the enclave signer on the request account for downstream instructions to verify.
    ///
    /// # Errors
    ///
    /// * `InsufficientQueue` - If the attestation queue has no active verifier oracles
    /// * `InvalidQuote` - If the verifier oracle has an invalid or expired quote
    /// * `IncorrectMrEnclave` - If the verifiers mr_enclave is not found in the attestation queue's enclave set
    ///
    /// * `RequestRoundNotActive` - If there is no active round for the request
    /// * `FunctionRequestNotReady` - If the request is not active yet
    /// * `UserRequestsDisabled` - If the function has disabled routines
    /// * `FunctionNotReady` - If the function status is not Active
    /// * `InvalidMrEnclave` - If the measured mr_enclave value is not null
    /// * `MrEnclavesEmpty` - If the function has 0 mr_enclaves whitelisted
    /// * `IncorrectMrEnclave` - If the measured mr_enclave is not found in the functions enclave set
    ///
    /// * `InvalidRequest` - If the provided params.request_slot does not match the active round request_slot
    /// * `IllegalExecuteAttempt` - If the request slot is 0 or greater than the current slot
    ///
    /// * `InvalidEscrow` - If the function escrow was provided but incorrect.
    /// * `MissingFunctionEscrow` - If the function escrow was not provided but required because func.routines_dev_fee > 0
    /// * `IncorrectObservedTime` - If the oracles observed time has drifted by 20 seconds
    /// * `InvalidParamsHash` If the container params hash is not the same as the routine params hash. Used to mitigate malicous RPCs.
    ///
    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn function_request_verify<'a>(
        mut ctx: Ctx<'_, 'a, FunctionRequestVerify<'a>>,
        params: FunctionRequestVerifyParams,
    ) -> Result<()> {
        FunctionRequestVerify::actuate(&mut ctx, &params)
    }

    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn function_request_close<'a>(
        mut ctx: Ctx<'_, 'a, FunctionRequestClose<'a>>,
        params: FunctionRequestCloseParams,
    ) -> Result<()> {
        FunctionRequestClose::actuate(&mut ctx, &params)
    }

    ///////////////////////////////////////////////////////////////////
    /// Routine Actions
    ///////////////////////////////////////////////////////////////////

    /// Initializes a Function routine account
    ///
    /// # Errors
    ///
    /// * `MissingSbWalletAuthoritySigner` - If the provided SbWallet authority does not match the routine
    ///     authority and the wallet authority did not sign the transaction.
    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn function_routine_init<'a>(
        mut ctx: Ctx<'_, 'a, FunctionRoutineInit<'a>>,
        params: FunctionRoutineInitParams,
    ) -> Result<()> {
        FunctionRoutineInit::actuate(&mut ctx, &params)
    }

    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn function_routine_set_config<'a>(
        mut ctx: Ctx<'_, 'a, FunctionRoutineSetConfig<'a>>,
        params: FunctionRoutineSetConfigParams,
    ) -> Result<()> {
        FunctionRoutineSetConfig::actuate(&mut ctx, &params)
    }

    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn function_routine_disable<'a>(
        mut ctx: Ctx<'_, 'a, FunctionRoutineDisable<'a>>,
        params: FunctionRoutineDisableParams,
    ) -> Result<()> {
        FunctionRoutineDisable::actuate(&mut ctx, &params)
    }

    /// Verifies a function routine was executed within an enclave and sets
    /// the enclave signer on the routine account for downstream instructions to verify.
    ///
    /// # Errors
    ///
    /// * `InsufficientQueue` - If the attestation queue has no active verifier oracles
    /// * `InvalidQuote` - If the verifier oracle has an invalid or expired quote
    /// * `IncorrectMrEnclave` - If the verifiers mr_enclave is not found in the attestation queue's enclave set
    /// * `IllegalVerifier` - If the incorrect verifier has responded and the routine is less than 30 seconds stale.
    ///
    /// * `RoutineDisabled` - If the routine has been disabled
    /// * `FunctionRoutinesDisabled` - If the function has disabled routines
    /// * `FunctionNotReady` - If the function status is not Active
    /// * `InvalidMrEnclave` - If the measured mr_enclave value is not null
    /// * `MrEnclavesEmpty` - If the function has 0 mr_enclaves whitelisted
    /// * `IncorrectMrEnclave` - If the measured mr_enclave is not found in the functions enclave set
    ///
    /// * `InvalidEscrow` - If the function escrow was provided but incorrect.
    /// * `MissingFunctionEscrow` - If the function escrow was not provided but required because func.routines_dev_fee > 0
    /// * `IncorrectObservedTime` - If the oracles observed time has drifted by 20 seconds
    /// * `InvalidParamsHash` If the container params hash is not the same as the routine params hash. Used to mitigate malicous RPCs.
    ///
    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn function_routine_verify<'a>(
        mut ctx: Ctx<'_, 'a, FunctionRoutineVerify<'a>>,
        params: FunctionRoutineVerifyParams,
    ) -> Result<()> {
        FunctionRoutineVerify::actuate(&mut ctx, &params)
    }
}
