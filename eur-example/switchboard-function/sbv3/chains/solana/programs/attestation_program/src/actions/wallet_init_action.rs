pub use crate::switchboard_attestation_program::*;
use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use anchor_spl::token::Token;

#[derive(Accounts)]
#[instruction(params: WalletInitParams)] // rpc parameters hint
pub struct WalletInit<'info> {
    #[account(
        init,
        payer = payer,
        space = SwitchboardWallet::size(),
        seeds = [
            mint.key().as_ref(),
            attestation_queue.key().as_ref(),
            authority.key().as_ref(),
            &SwitchboardWallet::parse_name(&params.name),
        ],
        bump,
    )]
    pub wallet: Box<Account<'info, SwitchboardWallet>>,

    #[account(address = anchor_spl::token::spl_token::native_mint::ID)]
    pub mint: Box<Account<'info, Mint>>,

    /// CHECK: authority doesnt need to sign
    pub authority: AccountInfo<'info>,

    // allows us to pull mint from the queue if we ever need to
    pub attestation_queue: AccountLoader<'info, AttestationQueueAccountData>,

    #[account(
        init,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = wallet,
    )]
    pub token_wallet: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub token_program: Program<'info, Token>,

    pub associated_token_program: Program<'info, AssociatedToken>,

    pub system_program: Program<'info, System>,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct WalletInitParams {
    pub name: Vec<u8>,
}

impl WalletInit<'_> {
    pub fn actuate(ctx: &mut Context<Self>, params: &WalletInitParams) -> Result<()> {
        let bump = *ctx.bumps.get("wallet").unwrap();

        ctx.accounts.wallet.initialize(&SwitchboardWalletInit {
            bump,
            mint: ctx.accounts.mint.key(),
            attestation_queue: ctx.accounts.attestation_queue.key(),
            authority: ctx.accounts.authority.key(),
            name: params.name.clone(),
            token_wallet: ctx.accounts.token_wallet.key(),
            withdraw_authority: None,
        })?;

        Ok(())
    }
}
