use crate::*;

use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(params: FunctionRoutineSetConfigParams)] // rpc parameters hint
pub struct FunctionRoutineSetConfig<'info> {
    #[account(
        mut,
        has_one = authority @ SwitchboardError::InvalidAuthority,
    )]
    pub routine: Box<Account<'info, FunctionRoutineAccountData>>,

    /// CHECK: require the authority to sign this txn
    pub authority: Signer<'info>,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct FunctionRoutineSetConfigParams {
    // Metadata
    pub name: Option<Vec<u8>>,
    pub metadata: Option<Vec<u8>>,

    // Fees
    pub bounty: Option<u64>,

    // Execution
    pub schedule: Option<Vec<u8>>,
    pub container_params: Option<Vec<u8>>,
    pub append_container_params: bool,
}

impl FunctionRoutineSetConfig<'_> {
    pub fn validate(
        &self,
        _ctx: &Context<Self>,
        _params: &FunctionRoutineSetConfigParams,
    ) -> Result<()> {
        Ok(())
    }

    pub fn actuate(ctx: &mut Context<Self>, params: &FunctionRoutineSetConfigParams) -> Result<()> {
        // Metadata
        ctx.accounts.routine.set_name(&params.name)?;
        ctx.accounts.routine.set_metadata(&params.metadata)?;

        // Fees
        ctx.accounts.routine.set_bounty(&params.bounty)?;

        // Execution
        if let Some(schedule) = params.schedule.as_ref() {
            // This will set is_disabled to true if the schedule is empty
            ctx.accounts.routine.set_schedule(schedule)?;
        }

        if let Some(container_params) = &params.container_params {
            ctx.accounts.routine.set_container_params(
                &mut container_params.clone(),
                params.append_container_params,
            )?;
        }

        // TODO: should we only update this if the config was actually changed?
        ctx.accounts.routine.updated_at = Clock::get()?.unix_timestamp;

        Ok(())
    }
}
