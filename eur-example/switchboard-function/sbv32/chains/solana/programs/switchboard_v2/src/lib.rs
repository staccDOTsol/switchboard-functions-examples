#![allow(non_snake_case)]
#![allow(clippy::result_large_err)]
#![allow(clippy::large_enum_variant)]
#![allow(clippy::unnecessary_mut_passed)]
mod version;
pub use version::VERSION;

pub mod actions;
pub mod ecvrf;
pub mod error;
pub mod event;
pub mod impls;
pub mod security;
pub mod utils;
pub use actions::*;
pub use ecvrf::*;
pub use error::*;
pub use event::*;
pub use impls::*;
pub use security::*;
pub use utils::calc_priority_fee;

use anchor_lang::prelude::*;
use anchor_lang::{AnchorDeserialize, AnchorSerialize, ZeroCopy};
use anchor_spl::token::TokenAccount;
use anchor_spl::token::Transfer;
use anchor_spl::token::{self, SetAuthority};

// use anchor_spl::vote_weight_record;
use anchor_spl::token::spl_token::instruction::AuthorityType;
use bytemuck::{Pod, Zeroable};
use core::cmp::Ordering;
use rust_decimal::Decimal;
use solana_program::native_token::LAMPORTS_PER_SOL;
use solana_program::pubkey;
use std::convert::TryInto;
use std::ops::BitAnd;

declare_id!("SW1TCH7qEPTdLsDHRgPuMQjbQxKdH2aBStViMFnt64f");

static SAS_PID: Pubkey = pubkey!("sbattyXrzedoNATfc4L31wC9Mhxsi1BmFhTiN8gDshx");
static GOVERNANCE_PID: Pubkey = pubkey!("2iNnEMZuLk2TysefLvXtS6kyvCFC7CDUTLLeatVgRend");
static ATOKEN_PID: Pubkey = pubkey!("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
// TODO: setup registrar
// static TOKEN_LOCKUP_REGISTRAR: Pubkey = pubkey!("SW1TCH7qEPTdLsDHRgPuMQjbQxKdH2aBStViMFnt64f");

static VRF_ACTUATE_AMOUNT: u64 = (LAMPORTS_PER_SOL / 500) / 278;

// vote_weight_record!(crate::ID);

pub fn assert_governance_pid(pubkey: &Pubkey) -> Result<()> {
    if *pubkey != GOVERNANCE_PID {
        return Err(error!(SwitchboardError::InvalidGovernancePidError));
    }
    Ok(())
}

pub fn assert_safe_zeroed(program_id: &Pubkey, buffer: &AccountInfo) -> Result<()> {
    let buffer_lamports = buffer.lamports.borrow();
    let buffer_len = buffer.try_borrow_data()?.len();
    let is_rent_exempt = Rent::get()?.is_exempt(**buffer_lamports, buffer_len);
    if !is_rent_exempt || *program_id != *buffer.owner || buffer.try_borrow_data()?[..8] != [0u8; 8]
    {
        return Err(error!(SwitchboardError::InvalidBufferAccountError));
    }
    Ok(())
}

pub fn assert_buffer_account(program_id: &Pubkey, buffer: &AccountInfo) -> Result<()> {
    let buffer_lamports = buffer.lamports.borrow();
    let buffer_len = buffer.try_borrow_data()?.len();
    let is_rent_exempt = Rent::get()?.is_exempt(**buffer_lamports, buffer_len);
    if !is_rent_exempt
        || *program_id != *buffer.owner
        || buffer.try_borrow_data()?[..8] != *BUFFER_DISCRIMINATOR
    {
        return Err(error!(SwitchboardError::InvalidBufferAccountError));
    }
    Ok(())
}

pub fn to_seed_refs<'a>(v: &'a Vec<Vec<u8>>) -> Vec<&'a [u8]> {
    let mut out = Vec::with_capacity(v.len());
    for idx in 0..v.len() {
        out.push(v[idx].as_ref());
    }
    out
}

pub fn transfer<'a>(
    token_program: &AccountInfo<'a>,
    from: &Account<'a, TokenAccount>,
    to: &Account<'a, TokenAccount>,
    authority: &AccountInfo<'a>,
    auth_seed: &[&[&[u8]]],
    amount: u64,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    let cpi_program = token_program.clone();
    let cpi_accounts = Transfer {
        from: from.to_account_info(),
        to: to.to_account_info(),
        authority: authority.clone(),
    };
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, auth_seed);
    token::transfer(cpi_ctx, amount)?;
    Ok(())
}

const STATE_SEED: &[u8] = b"STATE";
const AGGREGATOR_SEED: &[u8] = b"AggregatorAccountData";
const PERMISSION_SEED: &[u8] = b"PermissionAccountData";
const LEASE_SEED: &[u8] = b"LeaseAccountData";
const ORACLE_SEED: &[u8] = b"OracleAccountData";
const SLIDING_RESULT_SEED: &[u8] = b"SlidingResultAccountData";
const BUFFER_DISCRIMINATOR: &[u8] = b"BUFFERxx";
// const REALM_SPAWN_RECORD_SEED: &[u8] = b"RealmSpawnRecord";
// const VOTER_WEIGHT_RECORD_SEED: &[u8] = b"VoterWeightRecord";
// const TASK_SPEC_RECORD_SEED: &[u8] = b"TaskSpecRecord";

#[derive(Accounts)]
pub struct ViewVersion {}

#[program]
pub mod switchboard_v2 {
    pub use super::*;
    pub type Ctx<'a, 'b, T> = Context<'a, 'a, 'a, 'b, T>;

    pub fn view_version(mut _ctx: Ctx<'_, '_, ViewVersion>) -> Result<()> {
        msg!("VERSION: {}", VERSION);

        Err(error!(SwitchboardError::GenericError))
    }

    pub fn aggregator_close<'a>(
        mut _ctx: Ctx<'_, 'a, AggregatorClose<'a>>,
        _params: AggregatorCloseParams,
    ) -> Result<()> {
        #[cfg(feature = "devnet")]
        return AggregatorClose::actuate(&mut _ctx, &_params);

        #[cfg(not(feature = "devnet"))]
        msg!("aggregator_close is only enabled on devnet");
        Ok(())
    }

    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn set_bumps<'a>(mut ctx: Ctx<'_, 'a, SetBumps<'a>>, params: SetBumpsParams) -> Result<()> {
        SetBumps::actuate(&mut ctx, &params)
    }

    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn aggregator_add_job<'a>(
        mut ctx: Ctx<'_, 'a, AggregatorAddJob<'a>>,
        params: AggregatorAddJobParams,
    ) -> Result<()> {
        AggregatorAddJob::actuate(&mut ctx, &params)
    }
    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn aggregator_init<'a>(
        mut ctx: Ctx<'_, 'a, AggregatorInit<'a>>,
        params: AggregatorInitParams,
    ) -> Result<()> {
        AggregatorInit::actuate(&mut ctx, &params)
    }
    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn aggregator_function_upsert<'a>(
        mut ctx: Ctx<'_, 'a, AggregatorFunctionUpsert<'a>>,
        params: AggregatorFunctionUpsertParams,
    ) -> Result<()> {
        AggregatorFunctionUpsert::actuate(&mut ctx, &params)
    }
    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn aggregator_lock<'a>(
        mut ctx: Ctx<'_, 'a, AggregatorLock<'a>>,
        params: AggregatorLockParams,
    ) -> Result<()> {
        AggregatorLock::actuate(&mut ctx, &params)
    }
    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn aggregator_open_round<'a>(
        mut ctx: Ctx<'_, 'a, AggregatorOpenRound<'a>>,
        params: AggregatorOpenRoundParams,
    ) -> Result<()> {
        AggregatorOpenRound::actuate(&mut ctx, &params)
    }
    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn aggregator_remove_job<'a>(
        mut ctx: Ctx<'_, 'a, AggregatorRemoveJob<'a>>,
        params: AggregatorRemoveJobParams,
    ) -> Result<()> {
        AggregatorRemoveJob::actuate(&mut ctx, &params)
    }
    pub fn aggregator_save_result<'a>(
        mut ctx: Ctx<'_, 'a, AggregatorSaveResult<'a>>,
        params: AggregatorSaveResultParams,
    ) -> Result<()> {
        let params = AggregatorSaveResultParamsV2 {
            oracle_idx: params.oracle_idx,
            error: params.error,
            value: params.value,
            jobs_checksum: params.jobs_checksum,
            min_response: params.min_response,
            max_response: params.max_response,
            feed_permission_bump: params.feed_permission_bump,
            oracle_permission_bump: params.oracle_permission_bump,
            lease_bump: params.lease_bump,
            state_bump: params.state_bump,
            job_values: Default::default(),
        };
        ctx.accounts.validate(&ctx, &params)?;
        AggregatorSaveResult::actuate(&mut ctx, &params)
    }
    pub fn aggregator_save_result_v2<'a>(
        mut ctx: Ctx<'_, 'a, AggregatorSaveResult<'a>>,
        params: AggregatorSaveResultParams,
    ) -> Result<()> {
        let params = AggregatorSaveResultParamsV2 {
            oracle_idx: params.oracle_idx,
            error: params.error,
            value: params.value,
            jobs_checksum: params.jobs_checksum,
            min_response: params.min_response,
            max_response: params.max_response,
            feed_permission_bump: params.feed_permission_bump,
            oracle_permission_bump: params.oracle_permission_bump,
            lease_bump: params.lease_bump,
            state_bump: params.state_bump,
            job_values: Default::default(),
        };
        ctx.accounts.validate(&ctx, &params)?;
        AggregatorSaveResult::actuate(&mut ctx, &params)
    }
    pub fn aggregator_tee_save_result<'a>(
        mut ctx: Ctx<'_, 'a, AggregatorTeeSaveResult<'a>>,
        params: AggregatorTeeSaveResultParams,
    ) -> Result<()> {
        AggregatorTeeSaveResult::validate(&ctx, params.clone())?;
        AggregatorTeeSaveResult::actuate(&mut ctx, &params)
    }
    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn aggregator_set_authority<'a>(
        mut ctx: Ctx<'_, 'a, AggregatorSetAuthority<'a>>,
        params: AggregatorSetAuthorityParams,
    ) -> Result<()> {
        AggregatorSetAuthority::actuate(&mut ctx, &params)
    }
    // #[access_control(ctx.accounts.validate(&ctx, &params))]
    // pub fn aggregator_set_batch_size<'a>(
    //     mut ctx: Ctx<'_, 'a, AggregatorSetBatchSize<'a>>,
    //     params: AggregatorSetBatchSizeParams,
    // ) -> Result<()> {
    //     AggregatorSetBatchSize::actuate(&mut ctx, &params)
    // }
    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn aggregator_set_config<'a>(
        mut ctx: Ctx<'_, 'a, AggregatorSetConfig<'a>>,
        params: AggregatorSetConfigParams,
    ) -> Result<()> {
        AggregatorSetConfig::actuate(&mut ctx, &params)
    }
    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn aggregator_set_resolution_mode<'a>(
        mut ctx: Ctx<'_, 'a, AggregatorSetResolutionMode<'a>>,
        params: AggregatorSetResolutionModeParams,
    ) -> Result<()> {
        AggregatorSetResolutionMode::actuate(&mut ctx, &params)
    }
    // #[access_control(ctx.accounts.validate(&ctx, &params))]
    // pub fn aggregator_set_force_report_period<'a>(
    //     mut ctx: Ctx<'_, 'a, AggregatorSetForceReportPeriod<'a>>,
    //     params: AggregatorSetForceReportPeriodParams,
    // ) -> Result<()> {
    //     AggregatorSetForceReportPeriod::actuate(&mut ctx, &params)
    // }
    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn aggregator_set_history_buffer<'a>(
        mut ctx: Ctx<'_, 'a, AggregatorSetHistoryBuffer<'a>>,
        params: AggregatorSetHistoryBufferParams,
    ) -> Result<()> {
        AggregatorSetHistoryBuffer::actuate(&mut ctx, &params)
    }
    // #[access_control(ctx.accounts.validate(&ctx, &params))]
    // pub fn aggregator_set_min_jobs<'a>(
    //     mut ctx: Ctx<'_, 'a, AggregatorSetMinJobs<'a>>,
    //     params: AggregatorSetMinJobsParams,
    // ) -> Result<()> {
    //     AggregatorSetMinJobs::actuate(&mut ctx, &params)
    // }
    // #[access_control(ctx.accounts.validate(&ctx, &params))]
    // pub fn aggregator_set_min_oracles<'a>(
    //     mut ctx: Ctx<'_, 'a, AggregatorSetMinOracles<'a>>,
    //     params: AggregatorSetMinOraclesParams,
    // ) -> Result<()> {
    //     AggregatorSetMinOracles::actuate(&mut ctx, &params)
    // }
    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn aggregator_set_queue<'a>(
        mut ctx: Ctx<'_, 'a, AggregatorSetQueue<'a>>,
        params: AggregatorSetQueueParams,
    ) -> Result<()> {
        AggregatorSetQueue::actuate(&mut ctx, &params)
    }
    // #[access_control(ctx.accounts.validate(&ctx, &params))]
    // pub fn aggregator_set_update_interval<'a>(
    //     mut ctx: Ctx<'_, 'a, AggregatorSetUpdateInterval<'a>>,
    //     params: AggregatorSetUpdateIntervalParams,
    // ) -> Result<()> {
    //     AggregatorSetUpdateInterval::actuate(&mut ctx, &params)
    // }
    // #[access_control(ctx.accounts.validate(&ctx, &params))]
    // pub fn aggregator_set_variance_threshold<'a>(
    //     mut ctx: Ctx<'_, 'a, AggregatorSetVarianceThreshold<'a>>,
    //     params: AggregatorSetVarianceThresholdParams,
    // ) -> Result<()> {
    //     AggregatorSetVarianceThreshold::actuate(&mut ctx, &params)
    // }
    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn buffer_relayer_init<'a>(
        mut ctx: Ctx<'_, 'a, BufferRelayerInit<'a>>,
        params: BufferRelayerInitParams,
    ) -> Result<()> {
        BufferRelayerInit::actuate(&mut ctx, &params)
    }
    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn buffer_relayer_open_round<'a>(
        mut ctx: Ctx<'_, 'a, BufferRelayerOpenRound<'a>>,
        params: BufferRelayerOpenRoundParams,
    ) -> Result<()> {
        BufferRelayerOpenRound::actuate(&mut ctx, &params)
    }
    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn buffer_relayer_save_result<'a>(
        mut ctx: Ctx<'_, 'a, BufferRelayerSaveResult<'a>>,
        params: BufferRelayerSaveResultParams,
    ) -> Result<()> {
        BufferRelayerSaveResult::actuate(&mut ctx, &params)
    }
    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn crank_init<'a>(
        mut ctx: Ctx<'_, 'a, CrankInit<'a>>,
        params: CrankInitParams,
    ) -> Result<()> {
        CrankInit::actuate(&mut ctx, &params)
    }
    // #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn crank_pop<'a>(mut ctx: Ctx<'_, 'a, CrankPop<'a>>, params: CrankPopParams) -> Result<()> {
        let params = CrankPopParamsV2 {
            state_bump: params.state_bump,
            lease_bumps: params.lease_bumps,
            permission_bumps: params.permission_bumps,
            nonce: params.nonce,
            fail_open_on_account_mismatch: params.fail_open_on_account_mismatch,
            pop_idx: Some(0),
        };
        ctx.accounts.validate(&ctx, &params)?;
        CrankPop::actuate(&mut ctx, &params)
    }
    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn crank_pop_v2<'a>(
        mut ctx: Ctx<'_, 'a, CrankPop<'a>>,
        params: CrankPopParamsV2,
    ) -> Result<()> {
        CrankPop::actuate(&mut ctx, &params)
    }
    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn crank_push<'a>(
        mut ctx: Ctx<'_, 'a, CrankPush<'a>>,
        params: CrankPushParams,
    ) -> Result<()> {
        CrankPush::actuate(&mut ctx, &params)
    }
    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn job_init<'a>(mut ctx: Ctx<'_, 'a, JobInit<'a>>, params: JobInitParams) -> Result<()> {
        JobInit::actuate(&mut ctx, &params)
    }
    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn job_set_data<'a>(
        mut ctx: Ctx<'_, 'a, JobSetData<'a>>,
        params: JobSetDataParams,
    ) -> Result<()> {
        JobSetData::actuate(&mut ctx, &params)
    }
    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn lease_extend<'a>(
        mut ctx: Ctx<'_, 'a, LeaseExtend<'a>>,
        params: LeaseExtendParams,
    ) -> Result<()> {
        LeaseExtend::actuate(&mut ctx, &params)
    }
    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn lease_init<'a>(
        mut ctx: Ctx<'_, 'a, LeaseInit<'a>>,
        params: LeaseInitParams,
    ) -> Result<()> {
        LeaseInit::actuate(&mut ctx, &params)
    }
    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn lease_set_authority<'a>(
        mut ctx: Ctx<'_, 'a, LeaseSetAuthority<'a>>,
        params: LeaseSetAuthorityParams,
    ) -> Result<()> {
        LeaseSetAuthority::actuate(&mut ctx, &params)
    }
    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn lease_withdraw<'a>(
        mut ctx: Ctx<'_, 'a, LeaseWithdraw<'a>>,
        params: LeaseWithdrawParams,
    ) -> Result<()> {
        LeaseWithdraw::actuate(&mut ctx, &params)
    }
    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn oracle_heartbeat<'a>(
        mut ctx: Ctx<'_, 'a, OracleHeartbeat<'a>>,
        params: OracleHeartbeatParams,
    ) -> Result<()> {
        OracleHeartbeat::actuate(&mut ctx, &params)
    }
    pub fn oracle_tee_heartbeat<'a>(
        mut ctx: Ctx<'_, 'a, OracleTeeHeartbeat<'a>>,
        params: OracleTeeHeartbeatParams,
    ) -> Result<()> {
        ctx.accounts.validate(&ctx, &params)?;
        OracleTeeHeartbeat::actuate(&mut ctx, &params)
    }
    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn oracle_init<'a>(
        mut ctx: Ctx<'_, 'a, OracleInit<'a>>,
        params: OracleInitParams,
    ) -> Result<()> {
        OracleInit::actuate(&mut ctx, &params)
    }
    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn oracle_queue_init<'a>(
        mut ctx: Ctx<'_, 'a, OracleQueueInit<'a>>,
        params: OracleQueueInitParams,
    ) -> Result<()> {
        OracleQueueInit::actuate(&mut ctx, &params)
    }
    // #[access_control(ctx.accounts.validate(&ctx, &params))]
    // pub fn oracle_queue_set_rewards<'a>(
    //     mut ctx: Ctx<'_, 'a, OracleQueueSetRewards<'a>>,
    //     params: OracleQueueSetRewardsParams,
    // ) -> Result<()> {
    //     OracleQueueSetRewards::actuate(&mut ctx, &params)
    // }
    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn oracle_queue_set_config<'a>(
        mut ctx: Ctx<'_, 'a, OracleQueueSetConfig<'a>>,
        params: OracleQueueSetConfigParams,
    ) -> Result<()> {
        OracleQueueSetConfig::actuate(&mut ctx, &params)
    }
    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn oracle_withdraw<'a>(
        mut ctx: Ctx<'_, 'a, OracleWithdraw<'a>>,
        params: OracleWithdrawParams,
    ) -> Result<()> {
        OracleWithdraw::actuate(&mut ctx, &params)
    }
    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn permission_init<'a>(
        mut ctx: Ctx<'_, 'a, PermissionInit<'a>>,
        params: PermissionInitParams,
    ) -> Result<()> {
        PermissionInit::actuate(&mut ctx, &params)
    }
    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn permission_set<'a>(
        mut ctx: Ctx<'_, 'a, PermissionSet<'a>>,
        params: PermissionSetParams,
    ) -> Result<()> {
        PermissionSet::actuate(&mut ctx, &params)
    }
    // #[access_control(ctx.accounts.validate(&ctx, &params))]
    // pub fn permission_set_voter_weight<'a>(
    // mut ctx: Ctx<'_, 'a, PermissionSetVoterWeight<'a>>,
    // params: PermissionSetVoterWeightParams,
    // ) -> Result<()> {
    // PermissionSetVoterWeight::actuate(&mut ctx, &params)
    // }
    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn program_config<'a>(
        mut ctx: Ctx<'_, 'a, ProgramConfig<'a>>,
        params: ProgramConfigParams,
    ) -> Result<()> {
        ProgramConfig::actuate(&mut ctx, &params)
    }
    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn program_init<'a>(
        mut ctx: Ctx<'_, 'a, ProgramInit<'a>>,
        params: ProgramInitParams,
    ) -> Result<()> {
        ProgramInit::actuate(&mut ctx, &params)
    }
    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn vault_transfer<'a>(
        mut ctx: Ctx<'_, 'a, VaultTransfer<'a>>,
        params: VaultTransferParams,
    ) -> Result<()> {
        VaultTransfer::actuate(&mut ctx, &params)
    }
    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn vrf_init<'a>(mut ctx: Ctx<'_, 'a, VrfInit<'a>>, params: VrfInitParams) -> Result<()> {
        VrfInit::actuate(&mut ctx, &params)
    }
    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn vrf_close_action<'a>(
        mut ctx: Ctx<'_, 'a, VrfClose<'a>>,
        params: VrfCloseParams,
    ) -> Result<()> {
        VrfClose::actuate(&mut ctx, &params)
    }
    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn vrf_lite_close_action<'a>(
        mut ctx: Ctx<'_, 'a, VrfLiteClose<'a>>,
        params: VrfLiteCloseParams,
    ) -> Result<()> {
        VrfLiteClose::actuate(&mut ctx, &params)
    }
    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn vrf_lite_init<'a>(
        mut ctx: Ctx<'_, 'a, VrfLiteInit<'a>>,
        params: VrfLiteInitParams,
    ) -> Result<()> {
        VrfLiteInit::actuate(&mut ctx, &params)
    }
    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn vrf_lite_prove_and_verify<'a>(
        mut ctx: Ctx<'_, 'a, VrfLiteProveAndVerify<'a>>,
        params: VrfLiteProveAndVerifyParams,
    ) -> Result<()> {
        let mut payout_amount: u64 = 0;
        for _ in 0..5 {
            let should_reward = VrfLiteProveAndVerify::actuate(&mut ctx, &params)?;
            if should_reward {
                payout_amount += VRF_ACTUATE_AMOUNT;
            }
            let vrf = ctx.accounts.vrf_lite.load()?;
            let stage = vrf.builder.stage;
            if stage >= 16 || vrf.status == VrfStatus::StatusCallbackSuccess {
                break;
            }
        }
        msg!("payout_amount = {}", payout_amount);
        if payout_amount > 0 {
            transfer(
                &ctx.accounts.token_program,
                &ctx.accounts.escrow,
                &ctx.accounts.oracle_wallet,
                &ctx.accounts.program_state.to_account_info(),
                &[&[STATE_SEED, &[ctx.accounts.vrf_lite.load()?.state_bump]]],
                payout_amount,
            )?;
        }

        Ok(())
    }
    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn vrf_lite_request_randomness<'a>(
        mut ctx: Ctx<'_, 'a, VrfLiteRequestRandomness<'a>>,
        params: VrfLiteRequestRandomnessParams,
    ) -> Result<()> {
        VrfLiteRequestRandomness::actuate(&mut ctx, &params)
    }
    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn vrf_pool_init<'a>(
        mut ctx: Ctx<'_, 'a, VrfPoolInit<'a>>,
        params: VrfPoolInitParams,
    ) -> Result<()> {
        VrfPoolInit::actuate(&mut ctx, &params)
    }
    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn vrf_pool_remove<'a>(
        mut ctx: Ctx<'_, 'a, VrfPoolRemove<'a>>,
        params: VrfPoolRemoveParams,
    ) -> Result<()> {
        VrfPoolRemove::actuate(&mut ctx, &params)
    }
    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn vrf_pool_add<'a>(
        mut ctx: Ctx<'_, 'a, VrfPoolAdd<'a>>,
        params: VrfPoolAddParams,
    ) -> Result<()> {
        VrfPoolAdd::actuate(&mut ctx, &params)
    }
    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn vrf_pool_request<'a>(
        mut ctx: Ctx<'_, 'a, VrfPoolRequest<'a>>,
        params: VrfPoolRequestParams,
    ) -> Result<()> {
        VrfPoolRequest::actuate(&mut ctx, &params)
    }
    // #[access_control(ctx.accounts.validate(&ctx, &params))]
    // pub fn vrf_prove<'a>(mut ctx: Ctx<'_, 'a, VrfProve<'a>>, params: VrfProveParams) -> Result<()> {
    // VrfProve::actuate(&mut ctx, &params)
    // }
    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn vrf_prove_and_verify<'a>(
        mut ctx: Ctx<'_, 'a, VrfProveAndVerify<'a>>,
        params: VrfProveAndVerifyParams,
    ) -> Result<()> {
        let mut payout_amount: u64 = 0;
        for _ in 0..5 {
            let should_reward = VrfProveAndVerify::actuate(&mut ctx, &params)?;
            if should_reward {
                payout_amount += VRF_ACTUATE_AMOUNT;
            }
            let vrf = ctx.accounts.vrf.load()?;
            let stage = vrf.builders[params.idx as usize].stage;
            if stage >= 16 || vrf.status == VrfStatus::StatusCallbackSuccess {
                break;
            }
        }
        msg!("payout_amount = {}", payout_amount);
        if payout_amount > 0 {
            transfer(
                &ctx.accounts.token_program,
                &ctx.accounts.escrow,
                &ctx.accounts.oracle_wallet,
                &ctx.accounts.program_state.to_account_info(),
                &[&[STATE_SEED, &[params.state_bump]]],
                payout_amount,
            )?;
        }

        Ok(())
    }
    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn vrf_request_randomness<'a>(
        mut ctx: Ctx<'_, 'a, VrfRequestRandomness<'a>>,
        params: VrfRequestRandomnessParams,
    ) -> Result<()> {
        VrfRequestRandomness::actuate(&mut ctx, &params)
    }
    #[access_control(ctx.accounts.validate(&ctx, &params))]
    pub fn vrf_set_callback<'a>(
        mut ctx: Ctx<'_, 'a, VrfSetCallback<'a>>,
        params: VrfSetCallbackParams,
    ) -> Result<()> {
        VrfSetCallback::actuate(&mut ctx, &params)
    }
    // #[access_control(ctx.accounts.validate(&ctx, &params))]
    // pub fn vrf_verify<'a>(
    // mut ctx: Ctx<'_, 'a, VrfVerify<'a>>,
    // params: VrfVerifyParams,
    // ) -> Result<()> {
    // VrfVerify::actuate(&mut ctx, &params)
    // }

    /////////////////////////[SCHEMA]/////////////////////////////////

    #[account(zero_copy(unsafe))]
    #[repr(packed)]
    pub struct SbState {
        /// The account authority permitted to make account changes.
        pub authority: Pubkey,
        /// The token mint used for oracle rewards, aggregator leases, and other reward incentives.
        pub token_mint: Pubkey,
        /// Token vault used by the program to receive kickbacks.
        pub token_vault: Pubkey,
        /// The token mint used by the DAO.
        pub dao_mint: Pubkey,
        /// The PDA bump to derive the pubkey.
        pub bump: u8,
        /// Permitted enclave measurements
        pub mr_enclaves: [[u8; 32]; 6],
        /// Reserved for future info.
        pub _ebuf: [u8; 799],
    }

    #[account(zero_copy(unsafe))]
    #[repr(packed)]
    pub struct TaskSpecRecord {
        pub hash: Hash,
    }

    #[zero_copy(unsafe)]
    #[derive(Default)]
    #[repr(packed)]
    pub struct Hash {
        /// The bytes used to derive the hash.
        pub data: [u8; 32],
    }

    #[account(zero_copy(unsafe))]
    #[repr(packed)]
    pub struct AggregatorAccountData {
        /// Name of the aggregator to store on-chain.
        pub name: [u8; 32],
        /// Metadata of the aggregator to store on-chain.
        pub metadata: [u8; 128],
        /// Reserved.
        pub _reserved1: [u8; 32],
        /// Pubkey of the queue the aggregator belongs to.
        pub queue_pubkey: Pubkey,
        /// CONFIGS
        /// Number of oracles assigned to an update request.
        pub oracle_request_batch_size: u32,
        /// Minimum number of oracle responses required before a round is validated.
        pub min_oracle_results: u32,
        /// Minimum number of job results before an oracle accepts a result.
        pub min_job_results: u32,
        /// Minimum number of seconds required between aggregator rounds.
        pub min_update_delay_seconds: u32,
        /// Unix timestamp for which no feed update will occur before.
        pub start_after: i64,
        /// Change percentage required between a previous round and the current round. If variance percentage is not met, reject new oracle responses.
        pub variance_threshold: SwitchboardDecimal,
        /// Number of seconds for which, even if the variance threshold is not passed, accept new responses from oracles.
        pub force_report_period: i64,
        /// Timestamp when the feed is no longer needed.
        pub expiration: i64,
        //
        /// Counter for the number of consecutive failures before a feed is removed from a queue. If set to 0, failed feeds will remain on the queue.
        pub consecutive_failure_count: u64,
        /// Timestamp when the next update request will be available.
        pub next_allowed_update_time: i64,
        /// Flag for whether an aggregators configuration is locked for editing.
        pub is_locked: bool,
        /// Optional, public key of the crank the aggregator is currently using. Event based feeds do not need a crank.
        pub crank_pubkey: Pubkey,
        /// Latest confirmed update request result that has been accepted as valid.
        pub latest_confirmed_round: AggregatorRound,
        /// Oracle results from the current round of update request that has not been accepted as valid yet.
        pub current_round: AggregatorRound,
        /// List of public keys containing the job definitions for how data is sourced off-chain by oracles.
        pub job_pubkeys_data: [Pubkey; 16],
        /// Used to protect against malicious RPC nodes providing incorrect task definitions to oracles before fulfillment.
        pub job_hashes: [Hash; 16],
        /// Number of jobs assigned to an oracle.
        pub job_pubkeys_size: u32,
        /// Used to protect against malicious RPC nodes providing incorrect task definitions to oracles before fulfillment.
        pub jobs_checksum: [u8; 32],
        //
        /// The account delegated as the authority for making account changes.
        pub authority: Pubkey,
        /// Optional, public key of a history buffer account storing the last N accepted results and their timestamps.
        pub history_buffer: Pubkey,
        /// The previous confirmed round result.
        pub previous_confirmed_round_result: SwitchboardDecimal,
        /// The slot when the previous confirmed round was opened.
        pub previous_confirmed_round_slot: u64,
        /// 	Whether an aggregator is permitted to join a crank.
        pub disable_crank: bool,
        /// Job weights used for the weighted median of the aggregator's assigned job accounts.
        pub job_weights: [u8; 16],
        /// Unix timestamp when the feed was created.
        pub creation_timestamp: i64,
        /// Use sliding window or round based resolution
        /// NOTE: This changes result propogation in latest_round_result
        pub resolution_mode: AggregatorResolutionMode,
        pub base_priority_fee: u32,
        pub priority_fee_bump: u32,
        pub priority_fee_bump_period: u32,
        pub max_priority_fee_multiplier: u32,
        pub parent_function: Pubkey,
        /// Reserved for future info.
        pub _ebuf: [u8; 90],
    }
    #[derive(Copy, Clone, AnchorSerialize, AnchorDeserialize, Eq, PartialEq)]
    #[repr(u8)]
    pub enum AggregatorResolutionMode {
        ModeRoundResolution = 0,
        ModeSlidingResolution = 1,
    }
    #[account(zero_copy(unsafe))]
    #[repr(packed)]
    pub struct SlidingResultAccountData {
        pub data: [SlidingWindowElement; 16],
        pub bump: u8,
        pub _ebuf: [u8; 512],
    }
    #[zero_copy(unsafe)]
    #[derive(Default)]
    #[repr(packed)]
    pub struct SlidingWindowElement {
        pub oracle_key: Pubkey,
        pub value: SwitchboardDecimal,
        pub slot: u64,
        pub timestamp: i64,
    }
    #[zero_copy(unsafe)]
    #[derive(Default)]
    #[repr(packed)]
    pub struct AggregatorRound {
        /// Maintains the number of successful responses received from nodes.
        /// Nodes can submit one successful response per round.
        pub num_success: u32,
        /// Number of error responses.
        pub num_error: u32,
        /// Whether an update request round has ended.
        pub is_closed: bool,
        /// Maintains the `solana_program::clock::Slot` that the round was opened at.
        pub round_open_slot: u64,
        /// Maintains the `solana_program::clock::UnixTimestamp;` the round was opened at.
        pub round_open_timestamp: i64,
        /// Maintains the current median of all successful round responses.
        pub result: SwitchboardDecimal,
        /// Standard deviation of the accepted results in the round.
        pub std_deviation: SwitchboardDecimal,
        /// Maintains the minimum node response this round.
        pub min_response: SwitchboardDecimal,
        /// Maintains the maximum node response this round.
        pub max_response: SwitchboardDecimal,
        /// Pubkeys of the oracles fulfilling this round.
        pub oracle_pubkeys_data: [Pubkey; 16],
        /// Represents all successful node responses this round. `NaN` if empty.
        pub medians_data: [SwitchboardDecimal; 16],
        /// Current rewards/slashes oracles have received this round.
        pub current_payout: [i64; 16],
        /// Keep track of which responses are fulfilled here.
        pub medians_fulfilled: [bool; 16],
        /// Keeps track of which errors are fulfilled here.
        pub errors_fulfilled: [bool; 16],
    }
    #[zero_copy(unsafe)]
    #[derive(Default)]
    #[repr(packed)]
    pub struct AggregatorHistoryRow {
        /// The timestamp of the sample.
        pub timestamp: i64,
        /// The value of the sample.
        pub value: SwitchboardDecimal,
    }
    unsafe impl Pod for AggregatorHistoryRow {}
    unsafe impl Zeroable for AggregatorHistoryRow {}

    #[zero_copy(unsafe)]
    #[derive(Default, Eq, PartialEq)]
    #[repr(packed)]
    pub struct SwitchboardDecimal {
        /// The part of a floating-point number that represents the significant digits of that number,
        /// and that is multiplied by the base, 10, raised to the power of scale to give the actual value of the number.
        pub mantissa: i128,
        /// The number of decimal places to move to the left to yield the actual value.
        pub scale: u32,
    }

    #[account(zero_copy(unsafe))]
    #[repr(packed)]
    pub struct PermissionAccountData {
        /// The authority that is allowed to set permissions for this account.
        pub authority: Pubkey,
        /// The SwitchboardPermission enumeration assigned by the granter to the grantee.
        pub permissions: u32,
        /// 	Public key of account that is granting permissions to use its resources.
        pub granter: Pubkey,
        /// Public key of account that is being assigned permissions to use a granters resources.
        pub grantee: Pubkey,
        /// unused currently. may want permission PDA per permission for
        /// unique expiration periods, BUT currently only one permission
        /// per account makes sense for the infra. Dont over engineer.
        pub expiration: i64,
        /// The PDA bump to derive the pubkey.
        pub bump: u8,
        /// Reserved for future info.
        pub _ebuf: [u8; 255],
    }

    #[account(zero_copy(unsafe))]
    #[repr(packed)]
    pub struct RealmSpawnRecordAccountData {
        pub _ebuf: [u8; 256], // Buffer for future info
    }
    impl Default for RealmSpawnRecordAccountData {
        fn default() -> Self {
            unsafe { std::mem::zeroed() }
        }
    }

    #[derive(Copy, Clone, AnchorSerialize, AnchorDeserialize, Eq, PartialEq)]
    pub enum SwitchboardPermission {
        /// queue authority has permitted an Oracle Account to heartbeat on it's queue and receive update requests. Oracles always need permissions to join a queue.
        PermitOracleHeartbeat = 1 << 0,
        /// queue authority has permitted an Aggregator Account to request updates from it's oracles or join an existing crank. Note: Not required if a queue has unpermissionedFeedsEnabled.
        PermitOracleQueueUsage = 1 << 1,
        /// TODO: rename
        /// queue authority has permitted a VRF Account to request randomness from it's oracles. Note: Not required if a queue has unpermissionedVrfEnabled.
        PermitVrfRequests = 1 << 2,
    }

    /// This should be any ccount that links a permission to an escrow
    #[account(zero_copy(unsafe))]
    #[repr(packed)]
    pub struct LeaseAccountData {
        /// Public key of the token account holding the lease contract funds until rewarded to oracles for successfully processing updates
        pub escrow: Pubkey, // Needed, maybe derived, key + "update_escrow"?
        /// Public key of the oracle queue that the lease contract is applicable for.
        pub queue: Pubkey,
        /// Public key of the aggregator that the lease contract is applicable for
        pub aggregator: Pubkey,
        /// Public key of the Solana token program ID.
        pub token_program: Pubkey,
        /// Whether the lease contract is still active.
        pub is_active: bool,
        /// Index of an aggregators position on a crank.
        pub crank_row_count: u32,
        /// 	Timestamp when the lease contract was created.
        pub created_at: i64,
        /// Counter keeping track of the number of updates for the given aggregator.
        pub update_count: u128,
        /// Public key of keypair that may withdraw funds from the lease at any time
        pub withdraw_authority: Pubkey,
        /// The PDA bump to derive the pubkey.
        pub bump: u8,
        // Reserved for future info.
        pub _ebuf: [u8; 255],
    }

    // Sliding window queue
    #[account(zero_copy(unsafe))]
    #[repr(packed)]
    pub struct OracleQueueAccountData {
        /// Name of the queue to store on-chain.
        pub name: [u8; 32],
        /// Metadata of the queue to store on-chain.
        pub metadata: [u8; 64],
        /// The account delegated as the authority for making account changes or assigning permissions targeted at the queue.
        pub authority: Pubkey,
        /// Interval when stale oracles will be removed if they fail to heartbeat.
        pub oracle_timeout: u32,
        /// Rewards to provide oracles and round openers on this queue.
        pub reward: u64,
        /// The minimum amount of stake oracles must present to remain on the queue.
        pub min_stake: u64,
        /// Whether slashing is enabled on this queue.
        pub slashing_enabled: bool,
        /// The tolerated variance amount oracle results can have from the accepted round result before being slashed.
        /// slashBound = varianceToleranceMultiplier * stdDeviation Default: 2
        pub variance_tolerance_multiplier: SwitchboardDecimal,
        /// Number of update rounds new feeds are on probation for.
        /// If a feed returns 429s within probation period, auto disable permissions.
        pub feed_probation_period: u32,
        //
        /// Current index of the oracle rotation.
        pub curr_idx: u32,
        /// Current number of oracles on a queue.
        pub size: u32,
        /// Garbage collection index.
        pub gc_idx: u32,
        /// Consecutive failure limit for a feed before feed permission is revoked.
        pub consecutive_feed_failure_limit: u64,
        /// Consecutive failure limit for an oracle before oracle permission is revoked.
        pub consecutive_oracle_failure_limit: u64,
        /// Enabling this setting means data feeds do not need explicit permission to join the queue and request new values from its oracles.
        pub unpermissioned_feeds_enabled: bool,
        /// Enabling this setting means VRF accounts do not need explicit permission to join the queue and request new values from its oracles.
        pub unpermissioned_vrf_enabled: bool,
        /// TODO: Revenue percentage rewarded to job curators overall.
        pub curator_reward_cut: SwitchboardDecimal,
        /// Prevent new leases from being funded n this queue.
        /// Useful to turn down a queue for migrations, since authority is always immutable.
        pub lock_lease_funding: bool,
        /// Token mint used for the oracle queue rewards and slashing.
        pub mint: Pubkey,
        /// Whether oracles are permitted to fulfill buffer relayer update request.
        pub enable_buffer_relayers: bool,
        pub enable_tee_only: bool,
        /// Reserved for future info.
        pub _ebuf: [u8; 967],
        /// Maximum number of oracles a queue can support.
        pub max_size: u32,
        /// The public key of the OracleQueueBuffer account holding a collection of Oracle pubkeys that haver successfully heartbeated before the queues `oracleTimeout`.
        pub data_buffer: Pubkey,
    }

    #[account(zero_copy(unsafe))]
    #[repr(packed)]
    pub struct CrankAccountData {
        /// Name of the crank to store on-chain.
        pub name: [u8; 32],
        /// Metadata of the crank to store on-chain.
        pub metadata: [u8; 64],
        /// Public key of the oracle queue who owns the crank.
        pub queue_pubkey: Pubkey,
        /// Number of aggregators added to the crank.
        pub pq_size: u32,
        /// Maximum number of aggregators allowed to be added to a crank.
        pub max_rows: u32,
        /// Pseudorandom value added to next aggregator update time.
        pub jitter_modifier: u8,
        /// Reserved for future info.
        pub _ebuf: [u8; 255],
        /// The public key of the CrankBuffer account holding a collection of Aggregator pubkeys and their next allowed update time.
        pub data_buffer: Pubkey,
    }

    #[zero_copy(unsafe)]
    #[derive(Default)]
    #[repr(packed)]
    pub struct CrankRow {
        /// The PublicKey of the AggregatorAccountData.
        pub pubkey: Pubkey,
        /// The aggregator's next available update time.
        pub next_timestamp: i64,
    }
    unsafe impl Pod for CrankRow {}
    unsafe impl Zeroable for CrankRow {}

    #[derive(Copy, Clone, AnchorSerialize, AnchorDeserialize)]
    pub enum OracleResponseType {
        TypeSuccess,
        TypeError,
        TypeDisagreement,
        TypeNoResponse,
    }
    #[zero_copy(unsafe)]
    #[derive(Default)]
    #[repr(packed)]
    pub struct OracleMetrics {
        /// Number of consecutive successful update request.
        pub consecutive_success: u64,
        /// Number of consecutive update request that resulted in an error.
        pub consecutive_error: u64,
        /// Number of consecutive update request that resulted in a disagreement with the accepted median result.
        pub consecutive_disagreement: u64,
        /// Number of consecutive update request that were posted on-chain late and not included in an accepted result.
        pub consecutive_late_response: u64,
        /// Number of consecutive update request that resulted in a failure.
        pub consecutive_failure: u64,
        /// Total number of successful update request.
        pub total_success: u128,
        /// Total number of update request that resulted in an error.
        pub total_error: u128,
        /// Total number of update request that resulted in a disagreement with the accepted median result.
        pub total_disagreement: u128,
        /// Total number of update request that were posted on-chain late and not included in an accepted result.
        pub total_late_response: u128,
    }
    #[account(zero_copy(unsafe))]
    #[repr(packed)]
    pub struct OracleAccountData {
        /// Name of the oracle to store on-chain.
        pub name: [u8; 32],
        /// Metadata of the oracle to store on-chain.
        pub metadata: [u8; 128],
        /// The account delegated as the authority for making account changes or withdrawing funds from a staking wallet.
        pub oracle_authority: Pubkey,
        /// Unix timestamp when the oracle last heartbeated
        pub last_heartbeat: i64,
        /// Flag dictating if an oracle is active and has heartbeated before the queue's oracle timeout parameter.
        pub num_in_use: u32,
        // Must be unique per oracle account and authority should be a pda
        /// Stake account and reward/slashing wallet.
        pub token_account: Pubkey,
        /// Public key of the oracle queue who has granted it permission to use its resources.
        pub queue_pubkey: Pubkey,
        /// Oracle track record.
        pub metrics: OracleMetrics,
        /// The PDA bump to derive the pubkey.
        pub bump: u8,
        /// Reserved for future info.
        pub _ebuf: [u8; 255],
    }

    #[account]
    pub struct JobAccountData {
        /// Name of the job to store on-chain.
        pub name: [u8; 32],
        /// Metadata of the job to store on-chain.
        pub metadata: [u8; 64],
        /// The account delegated as the authority for making account changes.
        pub authority: Pubkey,
        /// Unix timestamp when the job is considered invalid
        pub expiration: i64,
        /// Hash of the serialized data to prevent tampering.
        pub hash: [u8; 32],
        /// Serialized protobuf containing the collection of task to retrieve data off-chain.
        pub data: Vec<u8>,
        /// The number of data feeds referencing the job account..
        pub reference_count: u32,
        /// The token amount funded into a feed that contains this job account.
        pub total_spent: u64,
        /// Unix timestamp when the job was created on-chain.
        pub created_at: i64,
        pub is_initializing: u8,
        // pub variables: Vec<[u8;16]>,
    }

    #[zero_copy(unsafe)]
    #[repr(packed)]
    pub struct VrfBuilder {
        /// The OracleAccountData that is producing the randomness.
        pub producer: Pubkey,
        /// The current status of the VRF verification.
        pub status: VrfStatus,
        /// The VRF proof sourced from the producer.
        pub repr_proof: [u8; 80],
        pub proof: EcvrfProofZC,
        pub Y_point: Pubkey,
        pub stage: u32,
        pub stage1_out: EcvrfIntermediate,
        pub R_1: EdwardsPointZC, // Ristretto
        pub R_2: EdwardsPointZC, // Ristretto
        pub stage3_out: EcvrfIntermediate,
        pub H_point: EdwardsPointZC, // Ristretto
        pub s_reduced: Scalar,
        pub Y_point_builder: [FieldElementZC; 3],
        pub Y_ristretto_point: EdwardsPointZC, // Ristretto
        pub mul_round: u8,
        pub hash_points_round: u8,
        pub mul_tmp1: CompletedPointZC,
        pub U_point1: EdwardsPointZC, // Ristretto
        pub U_point2: EdwardsPointZC, // Ristretto
        pub V_point1: EdwardsPointZC, // Ristretto
        pub V_point2: EdwardsPointZC, // Ristretto
        pub U_point: EdwardsPointZC,  // Ristretto
        pub V_point: EdwardsPointZC,  // Ristretto
        pub u1: FieldElementZC,
        pub u2: FieldElementZC,
        pub invertee: FieldElementZC,
        pub y: FieldElementZC,
        pub z: FieldElementZC,
        pub p1_bytes: [u8; 32],
        pub p2_bytes: [u8; 32],
        pub p3_bytes: [u8; 32],
        pub p4_bytes: [u8; 32],
        pub c_prime_hashbuf: [u8; 16],
        pub m1: FieldElementZC,
        pub m2: FieldElementZC,
        /// The number of transactions remaining to verify the VRF proof.
        pub tx_remaining: u32,
        /// Whether the VRF proof has been verified on-chain.
        pub verified: bool,
        /// The VRF proof verification result. Will be zeroized if still awaiting fulfillment.
        pub result: [u8; 32],
    }
    impl Default for VrfBuilder {
        fn default() -> Self {
            unsafe { std::mem::zeroed() }
        }
    }

    #[zero_copy(unsafe)]
    #[repr(packed)]
    pub struct AccountMetaZC {
        pub pubkey: Pubkey,
        pub is_signer: bool,
        pub is_writable: bool,
    }
    #[derive(Clone, AnchorSerialize, AnchorDeserialize)]
    pub struct AccountMetaBorsh {
        pub pubkey: Pubkey,
        pub is_signer: bool,
        pub is_writable: bool,
    }
    #[zero_copy(unsafe)]
    #[repr(packed)]
    pub struct CallbackZC {
        /// The program ID of the callback program being invoked.
        pub program_id: Pubkey,
        /// The accounts being used in the callback instruction.
        pub accounts: [AccountMetaZC; 32],
        /// The number of accounts used in the callback
        pub accounts_len: u32,
        /// The serialized instruction data.
        pub ix_data: [u8; 1024],
        /// The number of serialized bytes in the instruction data.
        pub ix_data_len: u32,
    }

    #[zero_copy(unsafe)]
    #[repr(packed)]
    pub struct VrfRound {
        /// The alpha bytes used to calculate the VRF proof.
        pub alpha: [u8; 256],
        /// The number of bytes in the alpha buffer.
        pub alpha_len: u32,
        /// The Slot when the VRF round was opened.
        pub request_slot: u64,
        /// The unix timestamp when the VRF round was opened.
        pub request_timestamp: i64,
        /// The VRF round result. Will be zeroized if still awaiting fulfillment.
        pub result: [u8; 32],
        /// The number of builders who verified the VRF proof.
        pub num_verified: u32,
        /// Reserved for future info.
        pub _ebuf: [u8; 256],
    }
    impl Default for VrfRound {
        fn default() -> Self {
            unsafe { std::mem::zeroed() }
        }
    }
    #[derive(Copy, Clone, Eq, PartialEq, Debug)]
    pub enum VrfStatus {
        /// VRF Account has not requested randomness yet.
        StatusNone,
        /// 	VRF Account has requested randomness but has yet to receive an oracle response.
        StatusRequesting,
        /// VRF Account has received a VRF proof that has yet to be verified on-chain.
        StatusVerifying,
        /// 	VRF Account has successfully requested and verified randomness on-chain.
        StatusVerified,
        /// 	VRF Account's callback was invoked successfully.
        StatusCallbackSuccess,
        /// 	Failed to verify VRF proof.
        StatusVerifyFailure,
    }
    impl std::fmt::Display for VrfStatus {
        fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
            match self {
                VrfStatus::StatusNone => write!(f, "StatusNone"),
                VrfStatus::StatusRequesting => write!(f, "StatusRequesting"),
                VrfStatus::StatusVerifying => write!(f, "StatusVerifying"),
                VrfStatus::StatusVerified => write!(f, "StatusVerified"),
                VrfStatus::StatusCallbackSuccess => write!(f, "StatusCallbackSuccess"),
                VrfStatus::StatusVerifyFailure => write!(f, "StatusVerifyFailure"),
            }
        }
    }
    #[account(zero_copy(unsafe))]
    #[repr(packed)]
    pub struct VrfAccountData {
        /// The current status of the VRF account.
        pub status: VrfStatus,
        /// Incremental counter for tracking VRF rounds.
        pub counter: u128,
        /// On-chain account delegated for making account changes.
        pub authority: Pubkey,
        /// The OracleQueueAccountData that is assigned to fulfill VRF update request.
        pub oracle_queue: Pubkey,
        /// The token account used to hold funds for VRF update request.
        pub escrow: Pubkey,
        /// The callback that is invoked when an update request is successfully verified.
        pub callback: CallbackZC,
        /// The number of oracles assigned to a VRF update request.
        pub batch_size: u32,
        /// Struct containing the intermediate state between VRF crank actions.
        pub builders: [VrfBuilder; 8],
        /// The number of builders.
        pub builders_len: u32,
        pub test_mode: bool,
        /// Oracle results from the current round of update request that has not been accepted as valid yet
        pub current_round: VrfRound,
        /// Reserved for future info.
        pub _ebuf: [u8; 1024],
    }

    #[account(zero_copy(unsafe))]
    #[repr(packed)]
    pub struct VrfLiteAccountData {
        /// The bump used to derive the SbState account.
        pub state_bump: u8,
        /// The bump used to derive the permission account.
        pub permission_bump: u8,
        /// The VrfPool the account belongs to.
        pub vrf_pool: Pubkey,
        /// The current status of the VRF account.
        pub status: VrfStatus,
        /// The VRF round result. Will be zeroized if still awaiting fulfillment.
        pub result: [u8; 32],
        /// Incremental counter for tracking VRF rounds.
        pub counter: u128,
        /// The alpha bytes used to calculate the VRF proof.
        // TODO: can this be smaller?
        pub alpha: [u8; 256],
        /// The number of bytes in the alpha buffer.
        pub alpha_len: u32,
        /// The Slot when the VRF round was opened.
        pub request_slot: u64,
        /// The unix timestamp when the VRF round was opened.
        pub request_timestamp: i64,
        /// On-chain account delegated for making account changes.
        pub authority: Pubkey,
        /// The OracleQueueAccountData that is assigned to fulfill VRF update request.
        pub queue: Pubkey,
        /// The token account used to hold funds for VRF update request.
        pub escrow: Pubkey,
        /// The callback that is invoked when an update request is successfully verified.
        pub callback: CallbackZC,
        /// The incremental VRF proof calculation.
        pub builder: VrfBuilder,
        // unused currently. may want permission PDA per permission for
        // unique expiration periods, BUT currently only one permission
        // per account makes sense for the infra. Dont over engineer.
        // TODO: should this be epoch or slot ??
        pub expiration: i64,
        pub _ebuf: [u8; 1024],
    }

    // #[repr(packed)]
    // #[derive(Default, Debug, Copy, Clone, AnchorDeserialize)]

    #[repr(packed)]
    #[zero_copy(unsafe)]
    #[derive(Default, Debug)]
    pub struct VrfPoolRow {
        pub timestamp: i64,
        pub pubkey: Pubkey,
    }

    #[repr(packed)]
    #[account(zero_copy(unsafe))]
    pub struct VrfPoolAccountData {
        /// ACCOUNTS
        pub authority: Pubkey, // authority can never be changed or else vrf accounts are useless
        pub queue: Pubkey,
        pub escrow: Pubkey, // escrow used to fund requests to reduce management

        // CONFIG
        pub min_interval: u32,
        pub max_rows: u32,

        // ITER
        pub size: u32,
        pub idx: u32,
        // Needs to be 4byte aligned up until here
        pub state_bump: u8,
        pub _ebuf: [u8; 135], // 256 bytes for pool config
    }

    #[account]
    pub struct BufferRelayerAccountData {
        /// Name of the buffer account to store on-chain.
        pub name: [u8; 32],
        /// Public key of the OracleQueueAccountData that is currently assigned to fulfill buffer relayer update request.
        pub queue_pubkey: Pubkey,
        /// Token account to reward oracles for completing update request.
        pub escrow: Pubkey,
        /// The account delegated as the authority for making account changes.
        pub authority: Pubkey,
        /// Public key of the JobAccountData that defines how the buffer relayer is updated.
        pub job_pubkey: Pubkey,
        /// Used to protect against malicious RPC nodes providing incorrect task definitions to oracles before fulfillment
        pub job_hash: [u8; 32],
        /// Minimum delay between update request.
        pub min_update_delay_seconds: u32,
        /// Whether buffer relayer config is locked for further changes.
        pub is_locked: bool,
        /// The current buffer relayer update round that is yet to be confirmed.
        pub current_round: BufferRelayerRound,
        /// The latest confirmed buffer relayer update round.
        pub latest_confirmed_round: BufferRelayerRound,
        /// The buffer holding the latest confirmed result.
        pub result: Vec<u8>,
    }

    #[derive(Default, Clone, AnchorSerialize, AnchorDeserialize)]
    pub struct BufferRelayerRound {
        /// Number of successful responses.
        pub num_success: u32,
        /// Number of error responses.
        pub num_error: u32,
        /// Slot when the buffer relayer round was opened.
        pub round_open_slot: u64,
        /// Timestamp when the buffer relayer round was opened.
        pub round_open_timestamp: i64,
        /// The public key of the oracle fulfilling the buffer relayer update request.
        pub oracle_pubkey: Pubkey,
    }
}
