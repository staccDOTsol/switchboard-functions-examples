use crate::*;
use anchor_lang::{prelude::*, Discriminator};

#[derive(Accounts)]
#[instruction(params: SetBumpsParams)] // rpc parameters hint
pub struct SetBumps<'info> {
    #[account(
        mut,
        seeds = [STATE_SEED],
        bump = params.state_bump,
    )]
    pub state: AccountLoader<'info, SbState>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct SetBumpsParams {
    pub state_bump: u8,
}
impl<'info> SetBumps<'info> {
    pub fn validate(
        &self,
        _ctx: &Context<'_, '_, '_, 'info, Self>,
        _params: &SetBumpsParams,
    ) -> Result<()> {
        Ok(())
    }

    pub fn actuate(
        ctx: &Context<'_, '_, '_, 'info, SetBumps<'info>>,
        params: &SetBumpsParams,
    ) -> Result<()> {
        let program = *ctx.accounts.state.to_account_info().owner;
        let state = &mut ctx.accounts.state.load_mut()?;
        state.bump = params.state_bump;

        for (_i, account_info) in ctx.remaining_accounts.iter().enumerate() {
            if *account_info.owner != program {
                return Err(error!(SwitchboardError::IncorrectProgramOwnerError));
            }

            // check discriminator
            let data = account_info.try_borrow_data()?;
            let mut disc_bytes = [0u8; 8];
            disc_bytes.copy_from_slice(&data[..8]);
            drop(data);

            match disc_bytes {
                PermissionAccountData::DISCRIMINATOR => {
                    let permission_loader = AccountLoader::<'_, PermissionAccountData>::try_from(
                        &account_info.to_account_info().clone(),
                    )?;
                    let mut permission = permission_loader.load_mut()?;

                    if permission.bump == 0 {
                        let (permission_pubkey, _permission_seeds, permission_bump) =
                            PermissionAccountData::key_from_seed(
                                ctx.program_id,
                                &permission.authority,
                                &permission.granter,
                                &permission.grantee,
                                None,
                            )
                            .map_err(|_| {
                                error!(SwitchboardError::PermissionAccountDeriveFailure)
                            })?;
                        assert!(permission_pubkey == account_info.key());
                        permission.bump = permission_bump;
                    }
                    drop(permission);
                }
                LeaseAccountData::DISCRIMINATOR => {
                    let lease_loader = AccountLoader::<'_, LeaseAccountData>::try_from(
                        &account_info.to_account_info().clone(),
                    )?;
                    let mut lease = lease_loader.load_mut()?;
                    if lease.bump == 0 {
                        let (lease_pubkey, _lease_seeds, lease_bump) =
                            LeaseAccountData::key_from_seed(
                                ctx.program_id,
                                &lease.queue,
                                &lease.aggregator,
                                None,
                            )
                            .map_err(|_| error!(SwitchboardError::LeaseAccountDeriveFailure))?;
                        assert!(lease_pubkey == account_info.key());
                        lease.bump = lease_bump;
                    }
                    drop(lease);
                }
                OracleAccountData::DISCRIMINATOR => {
                    let oracle_loader = AccountLoader::<'_, OracleAccountData>::try_from(
                        &account_info.to_account_info().clone(),
                    )?;
                    let mut oracle = oracle_loader.load_mut()?;
                    if oracle.bump == 0 {
                        let (oracle_pubkey, _oracle_seeds, oracle_bump) =
                            OracleAccountData::key_from_seed(
                                ctx.program_id,
                                &oracle.queue_pubkey,
                                &oracle.token_account,
                                None,
                            )
                            .map_err(|_| error!(SwitchboardError::PdaDeriveError))?;
                        assert!(oracle_pubkey == account_info.key());
                        oracle.bump = oracle_bump;
                    }
                    drop(oracle);
                }
                _ => return Err(error!(SwitchboardError::AccountDiscriminatorMismatch)),
            }
        }

        Ok(())
    }
}
