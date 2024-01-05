pub use crate::switchboard_attestation_program::*;
use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use anchor_spl::token::Token;

#[derive(Accounts)]
#[instruction(params: WalletWithdrawParams)] // rpc parameters hint
pub struct WalletWithdraw<'info> {
    #[account(
        mut,
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
    pub authority: Signer<'info>,

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

    pub token_program: Program<'info, Token>,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct WalletWithdrawParams {
    pub amount: u64,
}

impl WalletWithdraw<'_> {
    pub fn validate(&self, _ctx: &Context<Self>, _params: &WalletWithdrawParams) -> Result<()> {
        Ok(())
    }

    pub fn actuate(ctx: &mut Context<Self>, params: &WalletWithdrawParams) -> Result<()> {
        let withdraw_amount = std::cmp::min(ctx.accounts.token_wallet.amount, params.amount);
        msg!("pre-balance: {}", ctx.accounts.token_wallet.amount);
        transfer(
            &ctx.accounts.token_program,
            &ctx.accounts.token_wallet,
            &ctx.accounts.destination_wallet,
            &ctx.accounts.wallet.to_account_info(),
            &[&[
                ctx.accounts.mint.key().to_bytes().as_ref(),
                ctx.accounts.attestation_queue.key().to_bytes().as_ref(),
                ctx.accounts.authority.key().to_bytes().as_ref(),
                &ctx.accounts.wallet.name,
                &[ctx.accounts.wallet.bump],
            ]],
            withdraw_amount,
        )?;

        msg!("post-balance: {}", ctx.accounts.token_wallet.amount);
        // ctx.accounts.token_wallet.reload()?;
        let balance = ctx.accounts.token_wallet.amount;
        let wallet_pubkey = &ctx.accounts.wallet.key();

        if balance < ctx.accounts.attestation_queue.load()?.reward.into() {
            for remaining_account in ctx.remaining_accounts.iter() {
                if let Err(err) = set_fn_status(remaining_account, wallet_pubkey) {
                    msg!("failed to set function status: {:?}", err);
                }
            }
        }

        Ok(())
    }
}

fn set_fn_status<'a>(account_info: &AccountInfo<'a>, wallet: &Pubkey) -> Result<()> {
    let function_loader: AccountLoader<'a, FunctionAccountData> =
        AccountLoader::try_from(account_info)?;

    let mut func = function_loader.load_mut()?;
    if func.status == FunctionStatus::Active && func.escrow_wallet == *wallet {
        func.status = FunctionStatus::OutOfFunds;
    }

    Ok(())
}
