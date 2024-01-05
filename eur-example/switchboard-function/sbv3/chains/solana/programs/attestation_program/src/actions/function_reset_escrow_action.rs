use crate::*;

use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use anchor_spl::token::Token;
use solana_program::clock;

#[derive(Accounts)]
#[instruction(params: FunctionResetEscrowParams)] // rpc parameters hint
pub struct FunctionResetEscrow<'info> {
    #[account(
        mut,
        seeds = [
            FUNCTION_SEED,
            function.load()?.creator_seed.as_ref(),
            &function.load()?.created_at_slot.to_le_bytes()
        ],
        bump = function.load()?.bump,
        has_one = authority @ SwitchboardError::InvalidAuthority,
        has_one = escrow_wallet,
    )]
    pub function: AccountLoader<'info, FunctionAccountData>,

    pub authority: Signer<'info>,

    pub attestation_queue: AccountLoader<'info, AttestationQueueAccountData>,

    #[account(address = anchor_spl::token::spl_token::native_mint::ID)]
    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        has_one = mint,
        has_one = attestation_queue,
        constraint = escrow_wallet.key() != default_wallet.key()
    )]
    pub escrow_wallet: Box<Account<'info, SwitchboardWallet>>,

    #[account(
        init_if_needed,
        space = SwitchboardWallet::space(Some(1)),
        payer = payer,
        seeds = [
            mint.key().as_ref(),
            attestation_queue.key().as_ref(),
            authority.key().as_ref(),
            function.key().as_ref(),
        ],
        bump,
    )]
    pub default_wallet: Box<Account<'info, SwitchboardWallet>>,

    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = default_wallet,
    )]
    pub token_wallet: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub token_program: Program<'info, Token>,

    pub associated_token_program: Program<'info, AssociatedToken>,

    pub system_program: Program<'info, System>,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct FunctionResetEscrowParams {}

impl FunctionResetEscrow<'_> {
    pub fn validate(&self, ctx: &Context<Self>, _params: &FunctionResetEscrowParams) -> Result<()> {
        if ctx.accounts.escrow_wallet.key() == ctx.accounts.default_wallet.key() {
            return Err(error!(SwitchboardError::InvalidEscrow));
        }

        Ok(())
    }

    pub fn actuate(ctx: &mut Context<Self>, _params: &FunctionResetEscrowParams) -> Result<()> {
        let func = &mut ctx.accounts.function.load_mut()?;

        func.updated_at = clock::Clock::get()?.unix_timestamp;

        let bump = *ctx.bumps.get("default_wallet").unwrap();
        ctx.accounts
            .default_wallet
            .initialize(&SwitchboardWalletInit {
                bump,
                mint: ctx.accounts.mint.key(),
                attestation_queue: ctx.accounts.attestation_queue.key(),
                authority: ctx.accounts.authority.key(),
                name: ctx.accounts.function.key().to_bytes().to_vec(),
                token_wallet: ctx.accounts.token_wallet.key(),
                withdraw_authority: None,
            })?;

        func.escrow_wallet = ctx.accounts.default_wallet.key();
        func.escrow_token_wallet = ctx.accounts.default_wallet.token_wallet;

        func.reward_escrow_wallet = ctx.accounts.default_wallet.key();
        func.reward_escrow_token_wallet = ctx.accounts.default_wallet.token_wallet;

        ctx.accounts.escrow_wallet.remove_resource()?;
        ctx.accounts.default_wallet.add_resource()?;

        // TODO: should we extend lookup table with new wallet and token_wallet?

        Ok(())
    }
}
