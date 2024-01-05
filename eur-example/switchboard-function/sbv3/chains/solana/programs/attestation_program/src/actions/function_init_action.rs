use crate::*;

use anchor_lang::prelude::*;
use anchor_spl;
use anchor_spl::token::Mint;
use anchor_spl::token::Token;
use solana_address_lookup_table_program::instruction::create_lookup_table_signed;
use solana_address_lookup_table_program::instruction::extend_lookup_table;
use solana_program::program::invoke_signed;

#[derive(Accounts)]
#[instruction(params: FunctionInitParams)] // rpc parameters hint
pub struct FunctionInit<'info> {
    #[account(
        init,
        space = FunctionAccountData::size(),
        payer = payer,
        seeds = [
            FUNCTION_SEED,
            params.creator_seed.unwrap_or(payer.key().to_bytes()).as_ref(),
            params.recent_slot.to_le_bytes().as_ref()
        ],
        bump,
    )]
    pub function: AccountLoader<'info, FunctionAccountData>,

    /// CHECK: todo
    #[account(mut)]
    pub address_lookup_table: AccountInfo<'info>,

    /// CHECK:
    pub authority: AccountInfo<'info>,

    pub attestation_queue: AccountLoader<'info, AttestationQueueAccountData>,

    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: handle this manually because the PDA seed can vary
    #[account(mut)]
    pub escrow_wallet: AccountInfo<'info>,

    pub escrow_wallet_authority: Option<Signer<'info>>,

    /// CHECK: handle this manually because the PDA seed can vary
    #[account(mut)]
    pub escrow_token_wallet: AccountInfo<'info>,

    #[account(address = anchor_spl::token::spl_token::native_mint::ID)]
    pub mint: Box<Account<'info, Mint>>,

    pub token_program: Program<'info, Token>,

    pub associated_token_program: Program<'info, AssociatedToken>,

    pub system_program: Program<'info, System>,

    /// CHECK:
    #[account(
        constraint = address_lookup_program.executable,
        address = solana_address_lookup_table_program::id(),
    )]
    pub address_lookup_program: AccountInfo<'info>,
}
impl<'a> From<&mut FunctionInit<'a>> for WalletInitAccounts<'a> {
    fn from(ctx: &mut FunctionInit<'a>) -> Self {
        let mut wallet_authority = ctx.authority.to_account_info();

        if let Some(escrow_wallet_authority) = ctx.escrow_wallet_authority.as_ref() {
            if escrow_wallet_authority.key() != crate::id() {
                wallet_authority = escrow_wallet_authority.to_account_info();
            }
        }

        WalletInitAccounts {
            wallet: ctx.escrow_wallet.clone(),
            token_wallet: ctx.escrow_token_wallet.clone(),

            mint: *ctx.mint.clone(),
            attestation_queue: ctx.attestation_queue.to_account_info().clone(),
            authority: wallet_authority.clone(),

            payer: ctx.payer.clone(),

            system_program: ctx.system_program.clone(),
            token_program: ctx.token_program.clone(),
            associated_token_program: ctx.associated_token_program.clone(),
        }
    }
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct FunctionInitParams {
    // PDA fields
    pub recent_slot: u64,
    pub creator_seed: Option<[u8; 32]>,

    // Metadata
    pub name: Vec<u8>,
    pub metadata: Vec<u8>,

    // Container Config
    pub container: Vec<u8>,
    pub container_registry: Vec<u8>,
    pub version: Vec<u8>,
    pub mr_enclave: Option<[u8; 32]>,

    // pub schedule: Vec<u8>,

    // Request Config
    pub requests_disabled: bool,
    pub requests_require_authorization: bool,
    pub requests_dev_fee: u64,

    // Routines Config
    pub routines_disabled: bool,
    pub routines_require_authorization: bool,
    pub routines_dev_fee: u64,
}

impl FunctionInit<'_> {
    pub fn validate(&self, _ctx: &Context<Self>, _params: &FunctionInitParams) -> Result<()> {
        Ok(())
    }

    pub fn actuate(ctx: &mut Context<Self>, params: &FunctionInitParams) -> Result<()> {
        let clock = Clock::get()?;

        let mut wallet = SwitchboardWallet::init_if_needed(
            ctx.accounts.into(),
            ctx.accounts.function.key().to_bytes().to_vec(),
        )?;
        wallet.assert_new_resource_authority(
            &ctx.accounts.authority,
            &ctx.accounts.escrow_wallet_authority,
        )?;
        wallet.add_resource()?;
        wallet.exit(&switchboard_attestation_program::ID)?; // persist account changes
        drop(wallet);

        let func_bump = *ctx.bumps.get("function").unwrap();

        // create address lookup table
        let (create_lookup_ixn, lookup_address) = create_lookup_table_signed(
            ctx.accounts.function.key(),
            ctx.accounts.payer.key(),
            params.recent_slot,
        );

        if lookup_address != ctx.accounts.address_lookup_table.key() {
            return Err(error!(SwitchboardError::InvalidAddressLookupAddress));
        }

        let function_signer_seeds: &[&[&[u8]]] = &[&[
            FUNCTION_SEED,
            &params
                .creator_seed
                .unwrap_or(ctx.accounts.payer.key().to_bytes()),
            &params.recent_slot.to_le_bytes(),
            &[func_bump],
        ]];

        invoke_signed(
            &create_lookup_ixn,
            &vec![
                ctx.accounts.address_lookup_table.to_account_info(),
                ctx.accounts.function.to_account_info(),
                ctx.accounts.payer.to_account_info(),
                ctx.accounts.address_lookup_program.to_account_info(),
            ][..],
            function_signer_seeds,
        )?;

        // By stuffing accounts in a lookup table, downstream ixns can make use of the account savings
        // We should try to include most system / widely used accounts
        invoke_signed(
            &extend_lookup_table(
                ctx.accounts.address_lookup_table.key(),
                ctx.accounts.function.key(),
                Some(ctx.accounts.payer.key()),
                vec![
                    solana_program::system_program::ID, // 1
                    anchor_spl::token::ID,
                    anchor_spl::associated_token::ID,
                    solana_program::sysvar::rent::ID,
                    solana_program::sysvar::recent_blockhashes::ID, // 5
                    solana_program::sysvar::instructions::ID,
                    solana_program::sysvar::slot_hashes::ID,
                    solana_program::sysvar::slot_history::ID,
                    crate::SWITCHBOARD_PROGRAM_ID,
                    crate::ID, // 10
                    ctx.accounts.attestation_queue.key(),
                    ctx.accounts.function.key(),
                    ctx.accounts.authority.key(),
                    ctx.accounts.mint.key(),
                    ctx.accounts.escrow_wallet.key(), // 15
                    ctx.accounts.escrow_token_wallet.key(),
                ],
            ),
            &vec![
                ctx.accounts.address_lookup_table.to_account_info(),
                ctx.accounts.function.to_account_info(),
                ctx.accounts.payer.to_account_info(),
                ctx.accounts.address_lookup_program.to_account_info(),
            ][..],
            function_signer_seeds,
        )?;

        let mut func = ctx.accounts.function.load_init()?;

        func.bump = func_bump;
        func.created_at_slot = params.recent_slot;
        func.created_at = clock.unix_timestamp;
        func.updated_at = clock.unix_timestamp;
        func.authority = ctx.accounts.authority.key();

        func.escrow_wallet = ctx.accounts.escrow_wallet.key();
        func.escrow_token_wallet = ctx.accounts.escrow_token_wallet.key();

        func.reward_escrow_wallet = ctx.accounts.escrow_wallet.key(); // TODO
        func.reward_escrow_token_wallet = ctx.accounts.escrow_token_wallet.key(); // TODO

        if let Some(creator_seed) = params.creator_seed {
            func.creator_seed = creator_seed;
        } else {
            func.creator_seed = ctx.accounts.payer.key().to_bytes();
        }

        func.address_lookup_table = ctx.accounts.address_lookup_table.key();
        func.attestation_queue = ctx.accounts.attestation_queue.key();
        func.permissions = SwitchboardAttestationPermission::None.into();

        func.requests_disabled = params.requests_disabled.to_u8();
        func.requests_require_authorization = params.requests_require_authorization.to_u8();
        func.requests_dev_fee = params.requests_dev_fee;

        func.routines_disabled
            .update(!params.routines_disabled, None)?;
        func.routines_require_authorization = params.routines_require_authorization.to_u8();
        func.routines_dev_fee = params.routines_dev_fee;

        func.set_name(&params.name)?;
        func.set_metadata(&params.metadata)?;
        func.set_container(&params.container)?;
        func.set_container_registry(&params.container_registry)?;
        func.set_version(&params.version)?;

        let container = func.container.clone().to_vec();
        let container_registry = func.container_registry.clone().to_vec();
        let version = func.version.clone().to_vec();
        let schedule = func.schedule.clone().to_vec();

        func.enclave = Quote::default();

        let mr_enclave: [u8; 32] = if let Some(mr_enclave) = params.mr_enclave {
            mr_enclave
        } else {
            [0u8; 32]
        };

        // whitelist the first mr_enclave value
        if mr_enclave != [0u8; 32] {
            func.enclave.mr_enclave.clone_from_slice(&mr_enclave);
            func.set_mr_enclaves(&[mr_enclave])?;
        }

        // Should not use OutOfFunds enum variant anymore and handle off-chain
        func.status = FunctionStatus::Active;

        drop(func);

        emit!(FunctionInitEvent {
            function: ctx.accounts.function.key(),
            container,
            container_registry,
            version,
            schedule,
            mr_enclave: mr_enclave.to_vec(),
        });

        Ok(())
    }
}
