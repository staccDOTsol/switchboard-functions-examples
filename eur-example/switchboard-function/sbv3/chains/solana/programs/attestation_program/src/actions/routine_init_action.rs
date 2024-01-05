use crate::*;

use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use anchor_spl::token::Token;

#[derive(Accounts)]
#[instruction(params: FunctionRoutineInitParams)] // rpc parameters hint
pub struct FunctionRoutineInit<'info> {
    // TOOD: should this be zero or should we handle that in another ixn
    #[account(
        init,
        payer = payer,
        space = FunctionRoutineAccountData::space(params.max_container_params_len),
    )]
    pub routine: Box<Account<'info, FunctionRoutineAccountData>>,

    /// CHECK: the authority of the routine
    pub authority: AccountInfo<'info>,

    #[account(
        mut,
        has_one = attestation_queue @ SwitchboardError::InvalidQueue,
        has_one = authority @ SwitchboardError::InvalidAuthority,
    )]
    pub function: AccountLoader<'info, FunctionAccountData>,

    /// CHECK: function authority required to permit new routines
    #[account(
        signer,
        constraint = function.load()?.authority == function_authority.key()
    )]
    pub function_authority: Option<AccountInfo<'info>>,

    /// CHECK: handle this manually because the PDA seed can vary
    #[account(mut)]
    pub escrow_wallet: AccountInfo<'info>,

    pub escrow_wallet_authority: Option<Signer<'info>>,

    /// CHECK: handle this manually because the PDA seed can vary
    #[account(mut)]
    pub escrow_token_wallet: AccountInfo<'info>,

    #[account(address = anchor_spl::token::spl_token::native_mint::ID)]
    pub mint: Box<Account<'info, Mint>>,

    pub attestation_queue: AccountLoader<'info, AttestationQueueAccountData>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,

    pub token_program: Program<'info, Token>,

    pub associated_token_program: Program<'info, AssociatedToken>,
}
impl<'a> From<&mut FunctionRoutineInit<'a>> for WalletInitAccounts<'a> {
    fn from(ctx: &mut FunctionRoutineInit<'a>) -> Self {
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
pub struct FunctionRoutineInitParams {
    // Metadata
    pub name: Option<Vec<u8>>,
    pub metadata: Option<Vec<u8>>,

    // Fees
    pub bounty: Option<u64>,

    // Execution
    pub schedule: Vec<u8>,
    pub max_container_params_len: Option<u32>,
    pub container_params: Vec<u8>,
}

impl FunctionRoutineInit<'_> {
    pub fn validate(&self, ctx: &Context<Self>, _params: &FunctionRoutineInitParams) -> Result<()> {
        let attestation_queue = ctx.accounts.attestation_queue.load()?;
        attestation_queue.assert_is_ready()?;

        let func = ctx.accounts.function.load()?;
        func.ready_for_routines()?;
        func.assert_optional_routine_authority(&ctx.accounts.function_authority)?;
        func.assert_permissions(attestation_queue.require_usage_permissions)?;

        Ok(())
    }

    pub fn actuate(ctx: &mut Context<Self>, params: &FunctionRoutineInitParams) -> Result<()> {
        // Initialize the wallet if we need to
        let mut wallet = SwitchboardWallet::init_if_needed(
            ctx.accounts.into(),
            ctx.accounts.routine.key().to_bytes().to_vec(),
        )?;
        wallet.assert_new_resource_authority(
            &ctx.accounts.authority,
            &ctx.accounts.escrow_wallet_authority,
        )?;
        wallet.add_resource()?;
        wallet.exit(&switchboard_attestation_program::ID)?; // persist account changes
        drop(wallet);

        // Increment the number of routines on the function account
        let func = &mut ctx.accounts.function.load_mut()?;
        func.add_routine()?;

        // Metadata
        ctx.accounts.routine.set_name(&params.name)?;
        ctx.accounts.routine.set_metadata(&params.metadata)?;
        ctx.accounts.routine.created_at = Clock::get()?.unix_timestamp;
        ctx.accounts.routine.updated_at = Clock::get()?.unix_timestamp;

        // Fees
        ctx.accounts.routine.set_bounty(&params.bounty)?;

        // Accounts
        ctx.accounts.routine.authority = ctx.accounts.authority.key();
        ctx.accounts.routine.function = ctx.accounts.function.key();
        ctx.accounts.routine.attestation_queue = ctx.accounts.attestation_queue.key();

        ctx.accounts.routine.escrow_wallet = ctx.accounts.escrow_wallet.key();
        ctx.accounts.routine.escrow_token_wallet = ctx.accounts.escrow_token_wallet.key();

        // Execution
        ctx.accounts.routine.set_schedule(&params.schedule)?;
        ctx.accounts.routine.max_container_params_len = params
            .max_container_params_len
            .unwrap_or(DEFAULT_MAX_CONTAINER_PARAMS_LEN);
        ctx.accounts
            .routine
            .set_container_params(&mut params.container_params.clone(), false)?;

        // Status
        ctx.accounts.routine.status = RoutineStatus::Active;

        emit!(FunctionRoutineInitEvent {
            attestation_queue: ctx.accounts.attestation_queue.key(),
            function: ctx.accounts.function.key(),
            routine: ctx.accounts.routine.key(),
            schedule: ctx.accounts.routine.schedule,
        });

        Ok(())
    }
}
