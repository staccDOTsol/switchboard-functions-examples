use anchor_lang::prelude::*;
use anchor_spl::{token::Mint, vote_weight_record};
use solana_program::program::invoke;
use solana_program::pubkey;
use spl_governance::instruction::create_token_owner_record;
use spl_governance::state::governance::get_governance_data_for_realm;
use spl_governance::state::realm::get_realm_data_for_governing_token_mint;
use spl_governance::state::token_owner_record::get_token_owner_record_data_for_realm_and_governing_mint;
use spl_governance_addin_api::voter_weight::VoterWeightRecord as VWR;
use std::borrow::Borrow;
use std::collections::BTreeMap;
use switchboard_v2::{
    self,
    switchboard_v2::{
        actions::PermissionSetParams, cpi::accounts::PermissionSet, OracleAccountData,
        PermissionAccountData, SbState, SwitchboardPermission,
    },
};

declare_id!("B4EDDdMh5CmB6B9DeMmZmFvRzEgyHR5zWktf6httcMk6");

const STATE_SEED: &[u8] = b"state";
const REALM_SPAWN_RECORD_SEED: &[u8] = b"RealmSpawnRecord";
const VOTER_WEIGHT_RECORD_SEED: &[u8] = b"VoterWeightRecord";

const SWITCHBOARDV2_PROGRAM: Pubkey = pubkey!("7PMP6yE6qb3XzBQr5TK2GhuruYayZzBnT8U92ySaLESC");
const GOVERNANCE_PID: Pubkey = pubkey!("2iNnEMZuLk2TysefLvXtS6kyvCFC7CDUTLLeatVgRend");
const SBSTATE_PUBKEY: Pubkey = pubkey!("9USRJypqWMQrbGqGHTe2wDwXBpNT54SXmLXqpwhiYiw1");

vote_weight_record!(crate::ID);

#[program]
pub mod gameofnodes {
    use super::*;

    pub type Ctx<'a, 'b, T> = Context<'a, 'a, 'a, 'b, T>;

    pub fn initialize(
        ctx: Context<Initialize>,
        grant_authority: Pubkey,
        revoke_authority: Pubkey,
    ) -> Result<()> {
        let mut state = ctx.accounts.state.load_init()?;
        state.state_bump = *ctx.bumps.get("state").unwrap();
        state.grant_authority = grant_authority;
        state.revoke_authority = revoke_authority;
        Ok(())
    }

    pub fn grant_permission(ctx: Context<GrantPermission>) -> Result<()> {
        let cpi_program = ctx.accounts.switchboard_program.to_account_info();
        let cpi_accounts = PermissionSet {
            permission: ctx.accounts.permission.clone().to_account_info(),
            authority: ctx.accounts.state.to_account_info(),
        };
        let cpi_params = PermissionSetParams {
            permission: SwitchboardPermission::PermitOracleHeartbeat,
            enable: true,
        };
        let state_bump = ctx.accounts.state.load()?.state_bump;
        let seeds = &[STATE_SEED as &[u8], &[state_bump]];
        let signer = &[&seeds[..]];
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        switchboard_v2::cpi::permission_set(cpi_ctx, cpi_params)?;

        Ok(())
    }

    pub fn revoke_permission(ctx: Context<RevokePermission>) -> Result<()> {
        let cpi_program = ctx.accounts.switchboard_program.to_account_info();
        let cpi_accounts = PermissionSet {
            permission: ctx.accounts.permission.clone().to_account_info(),
            authority: ctx.accounts.state.to_account_info(),
        };
        let cpi_params = PermissionSetParams {
            permission: SwitchboardPermission::PermitOracleHeartbeat,
            enable: false,
        };
        let state_bump = ctx.accounts.state.load()?.state_bump;
        let seeds = &[STATE_SEED as &[u8], &[state_bump]];
        let signer = &[&seeds[..]];
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        switchboard_v2::cpi::permission_set(cpi_ctx, cpi_params)?;
        Ok(())
    }

    #[access_control(ctx.accounts.validate(&ctx))]
    pub fn permission_set_voter_weight<'a>(
        mut ctx: Ctx<'_, 'a, PermissionSetVoterWeight<'a>>,
    ) -> Result<()> {
        PermissionSetVoterWeight::actuate(&mut ctx)
    }

    #[error_code]
    #[derive(Eq, PartialEq)]
    pub enum GameOfNodesError {
        #[msg("Invalid Governance Account")]
        InvalidGovernanceAccountError,
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        seeds = [
            STATE_SEED,
        ],
        bump,
        payer = payer,
        space = 1+32+32+8
    )]
    pub state: AccountLoader<'info, State>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

/*
 * add: Oracle
 * add: OracleAuthority
 * add: sbState
 * add: GovProgram
 * add: DaoMint
 * add: spawnRecord
 * add: voterWeight
 * add: tokenOwnerRecord
 * add: realm
 */
#[derive(Accounts)]
pub struct GrantPermission<'info> {
    #[account(
        seeds = [
            STATE_SEED,
        ],
        bump = state.load()?.state_bump,
        has_one = grant_authority,
    )]
    pub state: AccountLoader<'info, State>,
    pub grant_authority: Signer<'info>,
    //pub switchboard_program: Program<'info, switchboard_v2>,
    /// CHECK: Needs to have the address constraint set
    #[account(address = SWITCHBOARDV2_PROGRAM)]
    pub switchboard_program: AccountInfo<'info>,
    #[account(
        owner = SWITCHBOARDV2_PROGRAM,
        mut,
    )]
    pub permission: AccountLoader<'info, PermissionAccountData>,
}

#[derive(Accounts)]
pub struct RevokePermission<'info> {
    #[account(
        seeds = [
            STATE_SEED,
        ],
        bump = state.load()?.state_bump,
        has_one = revoke_authority,
    )]
    pub state: AccountLoader<'info, State>,
    pub revoke_authority: Signer<'info>,
    //pub switchboard_program: Program<'info, switchboard_v2>,
    /// CHECK: Needs to have the address constraint set
    pub switchboard_program: AccountInfo<'info>,
    #[account(
        owner = SWITCHBOARDV2_PROGRAM,
        mut
    )]
    pub permission: AccountLoader<'info, PermissionAccountData>,
}

#[account(zero_copy)]
#[repr(packed)]
pub struct State {
    pub state_bump: u8,
    pub grant_authority: Pubkey,
    pub revoke_authority: Pubkey,
}

#[account(zero_copy)]
#[repr(packed)]
pub struct RealmSpawnRecordAccountData {
    pub spawner: Pubkey,
    pub spawner_privilege: bool,
    pub _ebuf: [u8; 256], // Buffer for future info
}
impl Default for RealmSpawnRecordAccountData {
    fn default() -> Self {
        unsafe { std::mem::zeroed() }
    }
}

#[derive(Accounts, Clone)]
pub struct PermissionSetVoterWeight<'info> {
    #[account(
        constraint = permission.load()?.authority == permission_authority.key(),
        owner = SWITCHBOARDV2_PROGRAM,
    )]
    pub permission: AccountLoader<'info, PermissionAccountData>,
    /// CHECK: In constrains: permission
    pub permission_authority: AccountInfo<'info>,
    #[account(
        has_one = oracle_authority,
        constraint = permission.load()?.grantee == oracle.key(),
        owner = SWITCHBOARDV2_PROGRAM,
    )]
    pub oracle: AccountLoader<'info, OracleAccountData>,
    /// CHECK: In constrains: oracle
    pub oracle_authority: AccountInfo<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(address = solana_program::system_program::ID)]
    pub system_program: Program<'info, System>,

    #[account(
        address = SBSTATE_PUBKEY,
    )]
    pub sb_state: AccountLoader<'info, SbState>,

    #[account(
        seeds = [
            STATE_SEED,
        ],
        bump,
    )]
    pub program_state: AccountLoader<'info, State>,

    /// CHECK: TODO
    #[account(address = GOVERNANCE_PID)]
    pub gov_program: AccountInfo<'info>,
    #[account(
        constraint =
            dao_mint.key() == sb_state.load()?.dao_mint
    )]
    pub dao_mint: Account<'info, Mint>,
    // Aaaaaaaaaaaaahhhhhhhhhhhhhhhhhh!!!!!!!!
    // DANGER DANGER DANGER
    #[account(
        init_if_needed,
        seeds = [
            REALM_SPAWN_RECORD_SEED,
            realm.key().as_ref()
        ],
        payer = payer,
        space = std::mem::size_of::<RealmSpawnRecordAccountData>() + 8,
        bump,
    )]
    pub spawn_record: AccountLoader<'info, RealmSpawnRecordAccountData>,
    // DANGER!!!
    // TODO: MEASURE OUT VOTERWEIGHTRECORD NEEDED SPACE
    #[account(
        init_if_needed,
        seeds = [
            VOTER_WEIGHT_RECORD_SEED,
            oracle.key().as_ref(),
        ],
        space = std::mem::size_of::<crate::VoterWeightRecord>() + 8,
        payer = payer,
        bump,
    )]
    pub voter_weight: Account<'info, crate::VoterWeightRecord>,
    /// CHECK: todo
    #[account(mut)]
    pub token_owner_record: AccountInfo<'info>,
    /// CHECK: todo
    #[account(
        owner = GOVERNANCE_PID,
    )]
    pub realm: AccountInfo<'info>,
}

pub fn maybe_init_token_owner_record<'info>(
    ctx: &Ctx<'_, 'info, PermissionSetVoterWeight<'info>>,
) -> Result<()> {
    let oracle_owner = &ctx.accounts.oracle_authority;
    let realm = &ctx.accounts.realm;
    let token_owner_record = &ctx.accounts.token_owner_record;
    let sb_state = ctx.accounts.sb_state.load()?;
    // Already initialized.
    let is_init = get_token_owner_record_data_for_realm_and_governing_mint(
        &GOVERNANCE_PID,
        ctx.accounts.token_owner_record.borrow(),
        &ctx.accounts.realm.key(),
        &ctx.accounts.dao_mint.key(),
    )
    .is_ok();
    if is_init {
        return Ok(());
    }
    let state = ctx.accounts.program_state.load()?;
    let ins = create_token_owner_record(
        &GOVERNANCE_PID,
        realm.key,
        &oracle_owner.key(),
        &sb_state.dao_mint,
        &ctx.accounts.payer.key(),
    );
    let accounts: &[AccountInfo<'info>] = &[
        realm.clone(),
        oracle_owner.clone(),
        token_owner_record.clone(),
        ctx.accounts.dao_mint.to_account_info(),
        ctx.accounts.payer.to_account_info(),
        ctx.accounts.system_program.to_account_info(),
    ];
    let dao_mint_key = ctx.accounts.dao_mint.key().clone();
    let mut seeds: Vec<&[u8]> = vec![
        b"governance".as_ref(),
        realm.key.as_ref(),
        dao_mint_key.as_ref(),
        oracle_owner.key.as_ref(),
    ];
    let (tor_key, tor_bump) = Pubkey::find_program_address(seeds.clone().as_ref(), &GOVERNANCE_PID);
    require!(
        ctx.accounts.token_owner_record.key() == tor_key,
        GameOfNodesError::InvalidGovernanceAccountError
    );
    let tor_bump = [tor_bump];
    seeds.push(&tor_bump);
    msg!("About to invoke");
    invoke(&ins, accounts).unwrap();
    Ok(())
}

impl<'a> PermissionSetVoterWeight<'a> {
    pub fn validate(&self, ctx: &Ctx<'_, 'a, PermissionSetVoterWeight<'a>>) -> Result<()> {
        let permission = ctx.accounts.permission.load()?;
        let spawn_record_seeds = [REALM_SPAWN_RECORD_SEED, ctx.accounts.realm.key.as_ref()];
        let voter_weight_seeds = [b"VoterWeightRecord", permission.grantee.as_ref()];
        let (realm_spawn_key, _) = Pubkey::find_program_address(&spawn_record_seeds, &crate::ID);
        let (voter_weight_key, _) = Pubkey::find_program_address(&voter_weight_seeds, &crate::ID);
        require!(
            ctx.accounts.spawn_record.key() == realm_spawn_key,
            GameOfNodesError::InvalidGovernanceAccountError
        );
        require!(
            ctx.accounts.voter_weight.key() == voter_weight_key,
            GameOfNodesError::InvalidGovernanceAccountError
        );
        /*get_governance_data_for_realm(
            &GOVERNANCE_PID,
            ctx.accounts.permission_authority.borrow(),
            &ctx.accounts.realm.key(),
        )?;*/
        msg!("getting realm data for gtm");
        get_realm_data_for_governing_token_mint(
            &GOVERNANCE_PID,
            ctx.accounts.realm.borrow(),
            &ctx.accounts.dao_mint.key(),
        )?;
        msg!("about to call maybe_init");
        maybe_init_token_owner_record(ctx)?;
        msg!("getting token owner record data");
        get_token_owner_record_data_for_realm_and_governing_mint(
            &GOVERNANCE_PID,
            ctx.accounts.token_owner_record.borrow(),
            &ctx.accounts.realm.key(),
            &ctx.accounts.dao_mint.key(),
        )?;
        Ok(())
    }

    // NOTICE: One realm per queue!
    pub fn actuate(ctx: &mut Ctx<'_, 'a, PermissionSetVoterWeight<'a>>) -> Result<()> {
        msg!("actuatin'");
        let permission = ctx.accounts.permission.load()?;
        msg!("loaded permission");

        let weight: u64;
        if (permission.permissions & SwitchboardPermission::PermitOracleHeartbeat) {
            weight = 1;
            msg!("Permissions correct. Voter weight granted.");
            if let Ok(mut spawn) = ctx.accounts.spawn_record.load_mut() {
                spawn.spawner_privilege = false;
                msg!("Spawner privilege removed, no longer needed.");
            }
            //might need to throw an error if this is false.
            else {
                msg!("Couldn't load spawn record, despite valid permission. This should never happen.");
            }
        } else {
            if let Ok(mut spawn) = ctx.accounts.spawn_record.load_init() {
                spawn.spawner = ctx.accounts.oracle_authority.key();
                spawn.spawner_privilege = true;
                weight = 1;
                msg!("It's the spawn. Voter weight granted.");
            } else {
                if let Ok(spawn) = ctx.accounts.spawn_record.load() {
                    if spawn.spawner == ctx.accounts.oracle_authority.key()
                        && spawn.spawner_privilege
                    {
                        msg!("Spawner privilege is active.");
                        weight = 1;
                    } else {
                        msg!("User not qualified for spawner privilege");
                        weight = 0;
                    }
                } else {
                    weight = 0;
                    msg!("This is a weird place to be. Couldn't load spawn privilege.");
                    // might need to throw here.
                }
            }
        }

        let vw = &mut ctx.accounts.voter_weight;
        vw.account_discriminator = VWR::ACCOUNT_DISCRIMINATOR.clone();
        vw.realm = ctx.accounts.realm.key();
        vw.governing_token_mint = ctx.accounts.dao_mint.key();
        vw.governing_token_owner = *ctx.accounts.oracle_authority.key;
        vw.voter_weight = weight;
        vw.voter_weight_expiry = Some(Clock::get()?.slot);
        Ok(())
    }
}
