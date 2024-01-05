pub use crate::switchboard_attestation_program::*;
use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use anchor_spl::token::Token;

#[derive(Accounts)]
#[instruction(params: WalletCloseParams)] // rpc parameters hint
pub struct WalletClose<'info> {
    #[account(
        mut,
        close = sol_dest,
        seeds = [
            mint.key().as_ref(),
            attestation_queue.key().as_ref(),
            authority.key().as_ref(),
            &wallet.name,
        ],
        bump = wallet.bump,
        has_one = token_wallet,
    )]
    pub wallet: Box<Account<'info, SwitchboardWallet>>,

    #[account(address = anchor_spl::token::spl_token::native_mint::ID)]
    pub mint: Account<'info, Mint>,

    /// CHECK:
    pub authority: AccountInfo<'info>,

    // allows us to pull mint from the queue if we ever need to
    pub attestation_queue: AccountLoader<'info, AttestationQueueAccountData>,

    #[account(mut)]
    pub token_wallet: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = destination_wallet.mint == token_wallet.mint,
    )]
    pub destination_wallet: Box<Account<'info, TokenAccount>>,

    #[account(
        seeds = [STATE_SEED],
        bump = state.load()?.bump
    )]
    pub state: AccountLoader<'info, AttestationProgramState>,

    /// CHECK:
    pub sol_dest: AccountInfo<'info>,

    #[account(
        mut,
        constraint = escrow_dest.is_native()
    )]
    pub escrow_dest: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct WalletCloseParams {}

impl WalletClose<'_> {
    pub fn validate(&self, _ctx: &Context<Self>, _params: &WalletCloseParams) -> Result<()> {
        // TODO
        Err(error!(SwitchboardError::IllegalExecuteAttempt))
    }

    pub fn actuate(_ctx: &mut Context<Self>, _params: &WalletCloseParams) -> Result<()> {
        Ok(())
    }
}
