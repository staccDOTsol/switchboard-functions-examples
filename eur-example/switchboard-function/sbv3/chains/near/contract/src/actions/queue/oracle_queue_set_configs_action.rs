use crate::error::Error;
use crate::*;
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::serde::{Deserialize, Serialize};
use std::vec::Vec;

#[derive(Default, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
pub struct OracleQueueSetConfigs {
    pub address: Uuid,
    pub authority: Option<String>,
    pub mint: Option<String>,
    pub name: Option<Vec<u8>>,
    pub metadata: Option<Vec<u8>>,
    pub reward: Option<U128>,
    pub min_stake: Option<U128>,
    pub feed_probation_period: Option<u32>,
    pub oracle_timeout: Option<u32>,
    pub slashing_enabled: Option<bool>,
    pub variance_tolerance_multiplier: Option<SwitchboardDecimal>,
    pub consecutive_feed_failure_limit: Option<u64>,
    pub consecutive_oracle_failure_limit: Option<u64>,
    pub unpermissioned_feeds: Option<bool>,
    pub unpermissioned_vrf: Option<bool>,
    pub enable_buffer_relayers: Option<bool>,
    pub max_gas_cost: Option<U128>,
}

impl Action for OracleQueueSetConfigs {
    fn validate(&self, ctx: &Contract) -> Result<(), Error> {
        let queue = ctx
            .queues
            .get(&self.address)
            .ok_or(Error::InvalidQueue.into())?;

        assert_authorized(&queue)?;
        Ok(())
    }

    fn actuate(&self, ctx: &mut Contract) -> Result<(), Error> {
        let mut queue = ctx.queues.get(&self.address).unwrap();

        queue.authority = self.authority.as_ref().unwrap_or(&queue.authority).clone();
        queue.mint = self.mint.as_ref().unwrap_or(&queue.mint).clone();
        queue.name = self.name.as_ref().unwrap_or(&queue.name).clone();
        queue.metadata = self.metadata.as_ref().unwrap_or(&queue.metadata).clone();

        if let Some(reward) = self.reward {
            queue.reward = reward.0;
        }
        if let Some(min_stake) = self.min_stake {
            queue.min_stake = min_stake.0;
        }

        queue.feed_probation_period = self
            .feed_probation_period
            .as_ref()
            .unwrap_or(&queue.feed_probation_period)
            .clone();
        queue.oracle_timeout = self
            .oracle_timeout
            .as_ref()
            .unwrap_or(&queue.oracle_timeout)
            .clone();
        queue.slashing_enabled = self
            .slashing_enabled
            .as_ref()
            .unwrap_or(&queue.slashing_enabled)
            .clone();
        queue.variance_tolerance_multiplier = self
            .variance_tolerance_multiplier
            .as_ref()
            .unwrap_or(&queue.variance_tolerance_multiplier)
            .clone();
        queue.consecutive_feed_failure_limit = self
            .consecutive_feed_failure_limit
            .as_ref()
            .unwrap_or(&queue.consecutive_feed_failure_limit)
            .clone();
        queue.consecutive_oracle_failure_limit = self
            .consecutive_oracle_failure_limit
            .as_ref()
            .unwrap_or(&queue.consecutive_oracle_failure_limit)
            .clone();
        queue.unpermissioned_feeds_enabled = self
            .unpermissioned_feeds
            .as_ref()
            .unwrap_or(&queue.unpermissioned_feeds_enabled)
            .clone();
        queue.unpermissioned_vrf_enabled = self
            .unpermissioned_vrf
            .as_ref()
            .unwrap_or(&queue.unpermissioned_vrf_enabled)
            .clone();
        queue.enable_buffer_relayers = self
            .enable_buffer_relayers
            .as_ref()
            .unwrap_or(&queue.enable_buffer_relayers)
            .clone();

        if let Some(max_gas_cost) = self.max_gas_cost {
            queue.max_gas_cost = max_gas_cost.0;
        }

        ctx.queues.insert(&self.address, &queue);

        Ok(())
    }
}
