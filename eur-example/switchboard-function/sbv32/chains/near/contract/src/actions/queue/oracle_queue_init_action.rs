use crate::*;
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};

#[derive(Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
pub struct OracleQueueInit {
    pub address: Uuid,
    pub authority: String,
    pub mint: String,
    pub name: Vec<u8>,
    pub metadata: Vec<u8>,
    pub reward: U128,
    pub min_stake: U128,
    pub feed_probation_period: u32,
    pub oracle_timeout: u32,
    pub slashing_enabled: bool,
    pub variance_tolerance_multiplier: SwitchboardDecimal,
    pub consecutive_feed_failure_limit: u64,
    pub consecutive_oracle_failure_limit: u64,
    pub queue_size: u32,
    pub unpermissioned_feeds: bool,
    pub unpermissioned_vrf: bool,
    pub enable_buffer_relayers: bool,
    pub max_gas_cost: U128,
}
impl Action for OracleQueueInit {
    fn validate(&self, ctx: &Contract) -> Result<(), Error> {
        require(ctx.queues.get(&self.address).is_none(), Error::InvalidQueue)?;
        require(self.address != Uuid::default(), Error::InvalidKey)?;
        Ok(())
    }

    fn actuate(&self, ctx: &mut Contract) -> Result<(), Error> {
        let mut hasher = Sha256::new();
        hasher.update(b"OracleQueueData");
        hasher.update(self.address);
        let queue = OracleQueue {
            address: self.address,
            max_size: self.queue_size,
            authority: self.authority.clone(),
            name: shrink_to(self.name.clone(), 256),
            metadata: shrink_to(self.metadata.clone(), 256),
            slashing_enabled: self.slashing_enabled,
            reward: self.reward.0,
            min_stake: self.min_stake.0,
            oracle_timeout: self.oracle_timeout,
            feed_probation_period: self.feed_probation_period,
            variance_tolerance_multiplier: self.variance_tolerance_multiplier,
            consecutive_feed_failure_limit: self.consecutive_feed_failure_limit,
            consecutive_oracle_failure_limit: self.consecutive_oracle_failure_limit,
            unpermissioned_feeds_enabled: self.unpermissioned_feeds,
            unpermissioned_vrf_enabled: self.unpermissioned_vrf,
            mint: self.mint.clone(),
            enable_buffer_relayers: self.enable_buffer_relayers,
            curator_reward_cut: Default::default(),
            curr_idx: 0,
            gc_idx: 0,
            lock_lease_funding: false,
            data: Vector::new(&hasher.finalize()[..]),
            max_gas_cost: self.max_gas_cost.0,
            creation_timestamp: now_seconds(),
            _ebuf: Default::default(),
            features: Default::default(),
        };
        // TODO: add storage deposit check
        ctx.queues.insert(&self.address, &queue);
        Ok(())
    }
}
