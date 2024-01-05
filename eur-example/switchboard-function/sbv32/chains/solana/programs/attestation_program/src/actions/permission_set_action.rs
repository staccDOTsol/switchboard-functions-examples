use crate::*;

use anchor_lang::prelude::*;

// De-incentivize spamming here.
#[derive(Accounts)]
#[instruction(params: AttestationPermissionSetParams)] // rpc parameters hint
pub struct AttestationPermissionSet<'info> {
    #[account(
        mut,
        seeds = [
            PERMISSION_SEED,
            attestation_queue.load()?.authority.key().as_ref(),
            attestation_queue.key().as_ref(),
            grantee.key().as_ref()
        ],
        bump = permission.load()?.bump,
    )]
    pub permission: Option<AccountLoader<'info, AttestationPermissionAccountData>>,

    pub authority: Signer<'info>,

    pub attestation_queue: AccountLoader<'info, AttestationQueueAccountData>,

    /// CHECK: can be VerifierAccount or a FunctionAccount
    #[account(
        constraint = grantee.owner == &ID
    )]
    pub grantee: AccountInfo<'info>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct AttestationPermissionSetParams {
    pub permission: u32,
    pub enable: bool,
}
impl AttestationPermissionSet<'_> {
    pub fn validate(
        &self,
        _ctx: &Context<Self>,
        _params: &AttestationPermissionSetParams,
    ) -> Result<()> {
        Ok(())
    }

    pub fn actuate(ctx: &Context<Self>, params: &AttestationPermissionSetParams) -> Result<()> {
        if let Some(permission) = ctx.accounts.permission.as_ref() {
            // verify enclave is an enclave account
            let quote_verifier_loader = AccountLoader::<'_, VerifierAccountData>::try_from(
                &ctx.accounts.grantee.to_account_info().clone(),
            )?;
            quote_verifier_loader.load()?;

            // set permissions
            let mut permission = permission.load_mut()?;
            permission.permissions |= params.permission;
            if !params.enable {
                permission.permissions &= !(params.permission);
            }
            emit!(PermissionSetEvent {
                permission: ctx.accounts.permission.as_ref().unwrap().key(),
            });
        } else {
            // verify enclave is a function account
            let function_loader = AccountLoader::<'_, FunctionAccountData>::try_from(
                &ctx.accounts.grantee.to_account_info().clone(),
            )?;
            let mut func = function_loader.load_mut()?;

            // verify it belongs to this queue
            if func.attestation_queue != ctx.accounts.attestation_queue.key() {
                return Err(error!(SwitchboardError::InvalidQueue));
            }

            func.permissions |= params.permission;
            if !params.enable {
                func.permissions &= !(params.permission);
            }

            emit!(PermissionSetEvent {
                permission: ctx.accounts.grantee.key(),
            });
        }

        Ok(())
    }
}
