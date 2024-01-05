use crate::*;

use anchor_lang::prelude::*;
use anchor_spl::token::spl_token::instruction::AuthorityType;
use anchor_spl::token::Mint;
use anchor_spl::token::Token;

#[derive(Accounts)]
#[instruction(params: FunctionRequestInitParams)] // rpc parameters hint
pub struct FunctionRequestInit<'info> {
    #[account(
        init,
        payer = payer,
        space = FunctionRequestAccountData::space(params.max_container_params_len)
    )]
    pub request: Box<Account<'info, FunctionRequestAccountData>>,

    /// CHECK: the authority of the request
    pub authority: AccountInfo<'info>,

    #[account(
        mut, // write lock issues ??
        has_one = attestation_queue @ SwitchboardError::InvalidQueue,
        // has_one = authority @ SwitchboardError::InvalidAuthority,
    )]
    pub function: AccountLoader<'info, FunctionAccountData>,

    /// CHECK: function authority required to permit new requests
    #[account(signer)]
    pub function_authority: Option<AccountInfo<'info>>,

    #[account(
        init,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = request,

    )]
    pub escrow: Box<Account<'info, TokenAccount>>,

    #[account(address = anchor_spl::token::spl_token::native_mint::ID)]
    pub mint: Account<'info, Mint>,

    #[account(
        seeds = [STATE_SEED],
        bump = state.load()?.bump
    )]
    pub state: AccountLoader<'info, AttestationProgramState>,

    pub attestation_queue: AccountLoader<'info, AttestationQueueAccountData>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,

    pub token_program: Program<'info, Token>,

    pub associated_token_program: Program<'info, AssociatedToken>,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct FunctionRequestInitParams {
    pub max_container_params_len: Option<u32>,
    pub container_params: Vec<u8>,
    pub garbage_collection_slot: Option<u64>,
}

impl FunctionRequestInit<'_> {
    pub fn validate(&self, ctx: &Context<Self>, _params: &FunctionRequestInitParams) -> Result<()> {
        let func = ctx.accounts.function.load()?;
        let attestation_queue = ctx.accounts.attestation_queue.load()?;

        func.ready_for_requests()?;
        func.assert_optional_authority(&ctx.accounts.function_authority)?;
        func.assert_permissions(attestation_queue.require_usage_permissions)?;
        attestation_queue.assert_is_ready()?;

        Ok(())
    }

    pub fn actuate(ctx: &mut Context<Self>, params: &FunctionRequestInitParams) -> Result<()> {
        let func = &mut ctx.accounts.function.load_mut()?;
        func.add_request()?;

        // set the escrow authority
        token::set_authority(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info().clone(),
                SetAuthority {
                    account_or_mint: ctx.accounts.escrow.to_account_info().clone(),
                    current_authority: ctx.accounts.request.to_account_info().clone(),
                },
            ),
            AuthorityType::AccountOwner,
            Some(ctx.accounts.state.key()),
        )?;

        ctx.accounts.request.initialize(
            &Clock::get()?,
            &ctx.accounts.function.key(),
            &ctx.accounts.attestation_queue.key(),
            &ctx.accounts.escrow.key(),
            &ctx.accounts.authority.key(),
            Some(params.container_params.clone()),
            params.max_container_params_len,
            params.garbage_collection_slot,
        )?;

        emit!(FunctionRequestInitEvent {
            attestation_queue: ctx.accounts.attestation_queue.key(),
            function: ctx.accounts.function.key(),
            request: ctx.accounts.request.key(),
        });

        Ok(())
    }
}
