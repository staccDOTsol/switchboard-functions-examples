use crate::*;

use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct AccountCloseOverride<'info> {
    #[account(
        mut,
        close = sol_dest,
    )]
    pub verifier: Option<AccountLoader<'info, VerifierAccountData>>,

    #[account(
        mut,
        close = sol_dest,
    )]
    pub function: Option<AccountLoader<'info, FunctionAccountData>>,

    /// CHECK:
    pub sol_dest: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

impl AccountCloseOverride<'_> {
    pub fn actuate(_ctx: &mut Context<Self>) -> Result<()> {
        Ok(())
    }
}
