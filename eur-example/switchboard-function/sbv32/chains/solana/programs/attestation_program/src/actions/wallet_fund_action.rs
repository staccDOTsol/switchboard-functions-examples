pub use crate::switchboard_attestation_program::*;
use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use anchor_spl::token::Token;

#[derive(Accounts)]
#[instruction(params: WalletFundParams)] // rpc parameters hint
pub struct WalletFund<'info> {
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
    pub authority: AccountInfo<'info>,

    // allows us to pull mint from the queue if we ever need to
    pub attestation_queue: AccountLoader<'info, AttestationQueueAccountData>,

    #[account(mut)]
    pub token_wallet: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint =
            funder_wallet.mint == token_wallet.mint && funder_wallet.owner == funder.key(),
    )]
    pub funder_wallet: Option<Box<Account<'info, TokenAccount>>>,

    pub funder: Signer<'info>,

    #[account(
        seeds = [STATE_SEED],
        bump = state.load()?.bump
    )]
    pub state: AccountLoader<'info, AttestationProgramState>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct WalletFundParams {
    pub transfer_amount: Option<u64>,
    pub wrap_amount: Option<u64>,
}

impl WalletFund<'_> {
    pub fn validate(&self, ctx: &Context<Self>, params: &WalletFundParams) -> Result<()> {
        // if transfer_amount is provided, make sure transfer_wallet is also provided
        if let Some(transfer_amount) = params.transfer_amount {
            if let Some(funder_wallet) = ctx.accounts.funder_wallet.as_ref() {
                if funder_wallet.amount < transfer_amount {
                    return Err(error!(SwitchboardError::InsufficientFunds));
                }
            } else {
                // if transfer_amount is specified, then the payer_wallet also needs to be provided
                return Err(error!(SwitchboardError::IllegalExecuteAttempt));
            }
        }

        if let Some(wrap_amount) = params.wrap_amount {
            if wrap_amount > ctx.accounts.funder.lamports() {
                return Err(error!(SwitchboardError::InsufficientFunds));
            }
        }

        // allow transfer_amount and wrap_amount to be empty
        // can use this to reset any funding statuses (if we need to)

        Ok(())
    }

    pub fn actuate(ctx: &mut Context<Self>, params: &WalletFundParams) -> Result<()> {
        if let Some(transfer_amount) = params.transfer_amount {
            let payer_wallet = ctx.accounts.funder_wallet.as_ref().unwrap(); // verified in actuate
            transfer(
                &ctx.accounts.token_program,
                payer_wallet,
                &ctx.accounts.token_wallet,
                &ctx.accounts.funder,
                &[],
                transfer_amount,
            )?;
        }

        if let Some(wrap_amount) = params.wrap_amount {
            wrap_native(
                &ctx.accounts.system_program,
                &ctx.accounts.token_program,
                &ctx.accounts.token_wallet,
                &ctx.accounts.funder.to_account_info(),
                &[&[STATE_SEED, &[ctx.accounts.state.load()?.bump]]],
                wrap_amount,
            )?;
        }

        ctx.accounts.token_wallet.reload()?;
        let balance = ctx.accounts.token_wallet.amount;
        let wallet_pubkey = &ctx.accounts.wallet.key();

        if balance >= ctx.accounts.attestation_queue.load()?.reward.into() {
            for remaining_account in ctx.remaining_accounts.iter() {
                if let Err(_err) = set_fn_status(remaining_account, wallet_pubkey, &ctx.accounts.token_wallet.key()) {
                } else {
                    emit!(FunctionFundEvent {
                        function: remaining_account.key(),
                        amount: balance,
                    });
                }
            }
        }

        Ok(())
    }
}

fn set_fn_status<'a>(account_info: &AccountInfo<'a>, wallet: &Pubkey, token_wallet: &Pubkey) -> Result<()> {
    let function_loader: Result<AccountLoader<'a, FunctionAccountData>> =
        AccountLoader::try_from(account_info);
    let request_loader: Result<Account<'a, FunctionRequestAccountData>> =
        Account::try_from(account_info);
    let routine_loader: Result<Account<'a, FunctionRoutineAccountData>> =
        Account::try_from(account_info);

    if function_loader.is_ok() {
        let function_loader = function_loader?;
        let mut func = function_loader.load_mut()?;
        if func.status == FunctionStatus::OutOfFunds && func.escrow_wallet == *wallet {
            func.status = FunctionStatus::Active;
            func.error_status = 0;
        }
    }
    if request_loader.is_ok() {
        let mut request = request_loader?;
        if request.escrow == *token_wallet {
            request.error_status = 0;
        }
    }
    if routine_loader.is_ok() {
        let mut routine = routine_loader?;
        if routine.escrow_wallet == *wallet {
            routine.status = RoutineStatus::Active;
            routine.error_status = 0;
        }
    }

    Ok(())
}
