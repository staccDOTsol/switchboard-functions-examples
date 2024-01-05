use crate::*;
use anchor_lang::prelude::*;
use solana_program::program::invoke;
// use solana_program::program::invoke_signed;
// use solana_program::system_instruction;
use anchor_spl::token::Mint;
use spl_governance::instruction::create_token_owner_record;
use spl_governance::state::governance::get_governance_data_for_realm;
use spl_governance::state::realm::get_realm_data_for_governing_token_mint;
use spl_governance::state::token_owner_record::get_token_owner_record_data_for_realm_and_governing_mint;
use spl_governance_addin_api::voter_weight::VoterWeightRecord;
use std::borrow::Borrow;

pub fn maybe_init_token_owner_record<'info>(
    ctx: &Ctx<'_, 'info, PermissionSetVoterWeight<'info>>,
) -> Result<()> {
    let oracle_owner = &ctx.accounts.oracle_authority;
    let realm = &ctx.accounts.realm;
    let token_owner_record = &ctx.accounts.token_owner_record;
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
        &state.dao_mint,
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
        SwitchboardError::InvalidGovernanceAccountError
    );
    let tor_bump = [tor_bump];
    seeds.push(&tor_bump);
    msg!("About to invoke");
    invoke(&ins, accounts).unwrap();
    Ok(())
}

#[derive(Accounts)]
#[instruction(params: PermissionSetVoterWeightParams)] // rpc parameters hint
pub struct PermissionSetVoterWeight<'info> {
    #[account(mut, constraint = permission.load()?.authority == permission_authority.key())]
    pub permission: AccountLoader<'info, PermissionAccountData>,
    /// CHECK: In constrains: permission
    pub permission_authority: AccountInfo<'info>,
    #[account(has_one = oracle_authority, constraint = permission.load()?.grantee == oracle.key())]
    pub oracle: AccountLoader<'info, OracleAccountData>,
    /// CHECK: In constrains: oracle
    pub oracle_authority: AccountInfo<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(address = solana_program::system_program::ID)]
    pub system_program: Program<'info, System>,
    #[account(seeds = [STATE_SEED], bump = params.state_bump, has_one = dao_mint)]
    pub program_state: AccountLoader<'info, SbState>,
    /// CHECK: TODO
    #[account(address = GOVERNANCE_PID)]
    pub gov_program: AccountInfo<'info>,
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
    //pub spawn_record: Account<'info, crate::RealmSpawnRecordAccountData>,
    pub spawn_record: AccountLoader<'info, RealmSpawnRecordAccountData>,
    //pub spawn_record: UncheckedAccount<'info>,
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
    pub realm: AccountInfo<'info>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct PermissionSetVoterWeightParams {
    pub state_bump: u8,
}
impl<'a> PermissionSetVoterWeight<'a> {
    pub fn validate(
        &self,
        ctx: &Ctx<'_, 'a, PermissionSetVoterWeight<'a>>,
        _params: &PermissionSetVoterWeightParams,
    ) -> Result<()> {
        let permission = ctx.accounts.permission.load()?;
        let spawn_record_seeds = [REALM_SPAWN_RECORD_SEED, ctx.accounts.realm.key.as_ref()];
        let voter_weight_seeds = [b"VoterWeightRecord", permission.grantee.as_ref()];
        let (realm_spawn_key, _) = Pubkey::find_program_address(&spawn_record_seeds, &crate::ID);
        let (voter_weight_key, _) = Pubkey::find_program_address(&voter_weight_seeds, &crate::ID);
        require!(
            ctx.accounts.spawn_record.key() == realm_spawn_key,
            SwitchboardError::InvalidGovernanceAccountError
        );
        require!(
            ctx.accounts.voter_weight.key() == voter_weight_key,
            SwitchboardError::InvalidGovernanceAccountError
        );
        get_governance_data_for_realm(
            &GOVERNANCE_PID,
            ctx.accounts.permission_authority.borrow(),
            &ctx.accounts.realm.key(),
        )?;
        get_realm_data_for_governing_token_mint(
            &GOVERNANCE_PID,
            ctx.accounts.realm.borrow(),
            &ctx.accounts.dao_mint.key(),
        )?;
        msg!("about to call maybe_init");
        maybe_init_token_owner_record(ctx)?;
        get_token_owner_record_data_for_realm_and_governing_mint(
            &GOVERNANCE_PID,
            ctx.accounts.token_owner_record.borrow(),
            &ctx.accounts.realm.key(),
            &ctx.accounts.dao_mint.key(),
        )?;
        Ok(())
    }

    // NOTICE: One realm per queue!
    pub fn actuate(
        ctx: &mut Ctx<'_, 'a, PermissionSetVoterWeight<'a>>,
        _params: &PermissionSetVoterWeightParams,
    ) -> Result<()> {
        let mut permission = ctx.accounts.permission.load_mut()?;
        let is_spawn: bool = ctx.accounts.spawn_record.load_init().is_ok();

        if is_spawn {
            permission.permissions |= SwitchboardPermission::PermitOracleHeartbeat as u32;
        }

        let weight = (permission.permissions & SwitchboardPermission::PermitOracleHeartbeat)
            .into();

        let vw = &mut ctx.accounts.voter_weight;
        vw.account_discriminator = VoterWeightRecord::ACCOUNT_DISCRIMINATOR.clone();
        vw.realm = ctx.accounts.realm.key();
        vw.governing_token_mint = ctx.accounts.dao_mint.key();
        vw.governing_token_owner = *ctx.accounts.oracle_authority.key;
        vw.voter_weight = weight;
        vw.voter_weight_expiry = Some(Clock::get()?.slot);
        Ok(())
    }
}
