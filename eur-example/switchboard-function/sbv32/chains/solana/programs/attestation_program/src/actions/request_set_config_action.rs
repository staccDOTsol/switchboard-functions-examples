use crate::*;

use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(params: FunctionRequestSetConfigParams)] // rpc parameters hint
pub struct FunctionRequestSetConfig<'info> {
    #[account(
        mut,
        has_one = authority @ SwitchboardError::InvalidAuthority,
    )]
    pub request: Box<Account<'info, FunctionRequestAccountData>>,

    /// CHECK: require the authority to sign this txn
    pub authority: Signer<'info>,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct FunctionRequestSetConfigParams {
    pub container_params: Vec<u8>,
    pub append_container_params: bool,
}

impl FunctionRequestSetConfig<'_> {
    pub fn validate(
        &self,
        ctx: &Context<Self>,
        _params: &FunctionRequestSetConfigParams,
    ) -> Result<()> {
        // dont allow changing params when a round is active
        if ctx.accounts.request.is_round_active(&Clock::get()?) {
            return Err(error!(SwitchboardError::IllegalExecuteAttempt));
        }

        Ok(())
    }

    pub fn actuate(ctx: &mut Context<Self>, params: &FunctionRequestSetConfigParams) -> Result<()> {
        ctx.accounts.request.set_container_params(
            &mut params.container_params.clone(),
            params.append_container_params,
        )?;

        Ok(())
    }
}
