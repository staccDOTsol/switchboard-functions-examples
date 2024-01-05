use crate::*;

use anchor_lang::prelude::*;
use anchor_spl::token::spl_token::instruction::AuthorityType;
use anchor_spl::token::Mint;
use anchor_spl::token::Token;

#[derive(Accounts)]
#[instruction(params: FunctionRequestInitAndTriggerParams)] // rpc parameters hint
pub struct FunctionRequestInitAndTrigger<'info> {
    #[account(
        init,
        payer = payer,
        space = FunctionRequestAccountData::space(params.max_container_params_len),
    )]
    pub request: Box<Account<'info, FunctionRequestAccountData>>,

    /// CHECK: the authority of the request
    pub authority: AccountInfo<'info>,

    #[account(
        mut,
        has_one = attestation_queue @ SwitchboardError::InvalidQueue,
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
        bump = state.load()?.bump,
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
pub struct FunctionRequestInitAndTriggerParams {
    pub bounty: Option<u64>,
    pub slots_until_expiration: Option<u64>,
    pub max_container_params_len: Option<u32>,
    pub container_params: Option<Vec<u8>>,
    pub garbage_collection_slot: Option<u64>,
    pub valid_after_slot: Option<u64>,
}

impl FunctionRequestInitAndTrigger<'_> {
    pub fn validate(
        &self,
        ctx: &Context<Self>,
        _params: &FunctionRequestInitAndTriggerParams,
    ) -> Result<()> {
        let func = ctx.accounts.function.load()?;
        let attestation_queue = ctx.accounts.attestation_queue.load()?;

        func.ready_for_requests()?;
        func.assert_optional_authority(&ctx.accounts.function_authority)?;
        func.assert_permissions(attestation_queue.require_usage_permissions)?;
        attestation_queue.assert_is_ready()?;

        Ok(())
    }

    pub fn actuate(
        ctx: &mut Context<Self>,
        params: &FunctionRequestInitAndTriggerParams,
    ) -> Result<()> {
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

        // perform the account initialization
        ctx.accounts.request.initialize(
            &Clock::get()?,
            &ctx.accounts.function.key(),
            &ctx.accounts.attestation_queue.key(),
            &ctx.accounts.escrow.key(),
            &ctx.accounts.authority.key(),
            params.container_params.clone(),
            params.max_container_params_len,
            params.garbage_collection_slot,
        )?;

        emit!(FunctionRequestInitEvent {
            attestation_queue: ctx.accounts.attestation_queue.key(),
            function: ctx.accounts.function.key(),
            request: ctx.accounts.request.key(),
        });

        let attestation_queue = ctx.accounts.attestation_queue.load()?;
        let verifier_idx = func.increment_queue_idx(attestation_queue.data_len);
        let verifier = attestation_queue.data[verifier_idx as usize];

        ctx.accounts.request.init_new_round(
            verifier,
            &Clock::get()?,
            verifier_idx,
            params.bounty,
            params.slots_until_expiration,
            params.valid_after_slot,
        )?;

        // fund the escrow with enough funds, wrapping the remaining of any missing funds
        let request_cost = u64::from(ctx.accounts.attestation_queue.load()?.reward)
            + params.bounty.unwrap_or_default()
            + func.requests_dev_fee;
        if request_cost > ctx.accounts.escrow.amount {
            let wrap_amount = request_cost
                .checked_sub(ctx.accounts.escrow.amount)
                .unwrap();

            wrap_native(
                &ctx.accounts.system_program,
                &ctx.accounts.token_program,
                &ctx.accounts.escrow.clone(),
                &ctx.accounts.payer.clone(),
                &[&[STATE_SEED, &[ctx.accounts.state.load()?.bump]]],
                wrap_amount,
            )?;
        }

        emit!(FunctionRequestTriggerEvent {
            attestation_queue: ctx.accounts.attestation_queue.key(),
            attestation_queue_authority: attestation_queue.authority,
            verifier,
            request: ctx.accounts.request.key(),
            function: ctx.accounts.function.key(),
            container: func.container.to_vec(),
            container_registry: func.container_registry.to_vec(),
            container_params: params.container_params.clone(),
            container_params_hash: ctx.accounts.request.container_params_hash.to_vec(), // to verify against the rpc state
            request_slot: Clock::get()?.slot,
            bounty: ctx.accounts.request.active_request.bounty,
            expiration_slot: ctx.accounts.request.active_request.expiration_slot,
            is_init: true,
        });

        Ok(())
    }
}
