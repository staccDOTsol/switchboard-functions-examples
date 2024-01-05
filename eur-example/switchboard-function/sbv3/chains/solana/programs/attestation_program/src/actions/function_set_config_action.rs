use crate::*;

use anchor_lang::prelude::*;
use solana_program::clock;

#[derive(Accounts)]
#[instruction(params: FunctionSetConfigParams)] // rpc parameters hint
pub struct FunctionSetConfig<'info> {
    #[account(
        mut,
        seeds = [
            FUNCTION_SEED,
            function.load()?.creator_seed.as_ref(),
            &function.load()?.created_at_slot.to_le_bytes()
        ],
        bump = function.load()?.bump,
        has_one = authority @ SwitchboardError::InvalidAuthority
    )]
    pub function: AccountLoader<'info, FunctionAccountData>,

    pub authority: Signer<'info>,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct FunctionSetConfigParams {
    // Metadata Config
    pub name: Option<Vec<u8>>,
    pub metadata: Option<Vec<u8>>,

    // Container Config
    pub container: Option<Vec<u8>>,
    pub container_registry: Option<Vec<u8>>,
    pub version: Option<Vec<u8>>,
    pub mr_enclaves: Option<Vec<[u8; 32]>>,

    // Requests Config
    pub requests_disabled: Option<bool>,
    pub requests_require_authorization: Option<bool>,
    pub requests_dev_fee: Option<u64>,

    // Routines Config
    pub routines_disabled: Option<bool>,
    pub lock_routines_disabled: Option<bool>,
    pub routines_require_authorization: Option<bool>,
    pub routines_dev_fee: Option<u64>,
}

impl FunctionSetConfig<'_> {
    pub fn validate(&self, _ctx: &Context<Self>, _params: &FunctionSetConfigParams) -> Result<()> {
        Ok(())
    }

    pub fn actuate(ctx: &Context<Self>, params: &FunctionSetConfigParams) -> Result<()> {
        let mut func = ctx.accounts.function.load_mut()?;
        func.updated_at = clock::Clock::get()?.unix_timestamp;

        if let Some(enclaves) = params.mr_enclaves.clone() {
            if !enclaves.is_empty() {
                func.set_mr_enclaves(&enclaves)?;
            }
        }

        if let Some(name) = &params.name {
            func.set_name(name)?;
        }

        if let Some(metadata) = &params.metadata {
            func.set_metadata(metadata)?;
        }

        if let Some(container) = &params.container {
            func.set_container(container)?;
            func.permissions = SwitchboardAttestationPermission::None.into();
        }

        if let Some(container_registry) = &params.container_registry {
            func.set_container_registry(container_registry)?;
            func.permissions = SwitchboardAttestationPermission::None.into();
        }

        if let Some(version) = &params.version {
            func.set_version(version)?;
            func.permissions = SwitchboardAttestationPermission::None.into();
        }

        if let Some(requests_disabled) = &params.requests_disabled {
            func.requests_disabled = requests_disabled.to_u8();
        }

        if let Some(requests_require_authorization) = &params.requests_require_authorization {
            func.requests_require_authorization = requests_require_authorization.to_u8();
        }

        if let Some(requests_dev_fee) = &params.requests_dev_fee {
            func.requests_dev_fee = *requests_dev_fee;
        }

        if let Some(routines_disabled) = &params.routines_disabled {
            func.schedule = [0u8; 64];
            func.routines_disabled.update(!routines_disabled, None)?;
        }

        if let Some(lock_routines_disabled) = &params.lock_routines_disabled {
            if *lock_routines_disabled {
                func.routines_disabled.lock()?;
            }
        }

        if let Some(routines_require_authorization) = &params.routines_require_authorization {
            func.routines_require_authorization = routines_require_authorization.to_u8();
        }

        if let Some(routines_dev_fee) = &params.routines_dev_fee {
            func.routines_dev_fee = *routines_dev_fee;
        }

        if params.container.is_some()
            || params.container_registry.is_some()
            || params.version.is_some()
        {
            func.enclave.reset_verification()?;
        }

        emit!(FunctionSetConfigEvent {
            function: ctx.accounts.function.key(),
            container: func.container.to_vec(),
            container_registry: func.container_registry.to_vec(),
            version: func.version.to_vec(),
            schedule: func.schedule.to_vec(),
            mr_enclaves: func
                .mr_enclaves
                .to_vec()
                .iter()
                .map(|e| e.to_vec())
                .collect(),
        });
        Ok(())
    }
}
