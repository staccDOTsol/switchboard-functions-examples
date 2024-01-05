use crate::*;

use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(params: OracleQueueSetConfigParams)] // rpc parameters hint
pub struct OracleQueueSetConfig<'info> {
    #[account(mut, has_one = authority @ SwitchboardError::InvalidAuthorityError)]
    pub queue: AccountLoader<'info, OracleQueueAccountData>,
    pub authority: Signer<'info>,
}
#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct OracleQueueSetConfigParams {
    name: Option<[u8; 32]>,
    metadata: Option<[u8; 64]>,
    unpermissioned_feeds_enabled: Option<bool>,
    unpermissioned_vrf_enabled: Option<bool>,
    enable_buffer_relayers: Option<bool>,
    variance_tolerance_multiplier: Option<BorshDecimal>,
    slashing_enabled: Option<bool>,
    reward: Option<u64>,
    min_stake: Option<u64>,
    oracle_timeout: Option<u32>,
    consecutive_feed_failure_limit: Option<u64>,
    consecutive_oracle_failure_limit: Option<u64>,
    enable_tee_only: Option<bool>,
}
impl OracleQueueSetConfig<'_> {
    pub fn validate(
        &self,
        _ctx: &Context<Self>,
        _params: &OracleQueueSetConfigParams,
    ) -> Result<()> {
        Ok(())
    }

    pub fn actuate(
        ctx: &Context<OracleQueueSetConfig>,
        params: &OracleQueueSetConfigParams,
    ) -> Result<()> {
        let queue = &mut ctx.accounts.queue.load_mut()?;

        if let Some(name) = params.name {
            queue.name = name;
        }

        if let Some(metadata) = params.metadata {
            queue.metadata = metadata;
        }

        if let Some(unpermissioned_feeds_enabled) = params.unpermissioned_feeds_enabled {
            queue.unpermissioned_feeds_enabled = unpermissioned_feeds_enabled;
        }

        if let Some(unpermissioned_vrf_enabled) = params.unpermissioned_vrf_enabled {
            queue.unpermissioned_vrf_enabled = unpermissioned_vrf_enabled;
        }

        if let Some(enable_buffer_relayers) = params.enable_buffer_relayers {
            queue.enable_buffer_relayers = enable_buffer_relayers;
        }

        // should this be validated to be positive?
        if let Some(variance_tolerance_multiplier) = params.variance_tolerance_multiplier {
            queue.variance_tolerance_multiplier = variance_tolerance_multiplier.into();
        }

        if let Some(slashing_enabled) = params.slashing_enabled {
            queue.slashing_enabled = slashing_enabled;
        }

        if let Some(reward) = params.reward {
            queue.reward = reward;
        }

        if let Some(min_stake) = params.min_stake {
            queue.min_stake = min_stake;
        }

        if let Some(oracle_timeout) = params.oracle_timeout {
            queue.oracle_timeout = oracle_timeout;
        }

        if let Some(consecutive_feed_failure_limit) = params.consecutive_feed_failure_limit {
            queue.consecutive_feed_failure_limit = consecutive_feed_failure_limit;
        }

        if let Some(consecutive_oracle_failure_limit) = params.consecutive_oracle_failure_limit {
            queue.consecutive_oracle_failure_limit = consecutive_oracle_failure_limit;
        }

        if let Some(enable_tee_only) = params.enable_tee_only {
            queue.enable_tee_only = enable_tee_only;
        }

        Ok(())
    }
}
