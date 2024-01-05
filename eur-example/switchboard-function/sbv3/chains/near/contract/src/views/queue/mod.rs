pub mod view_all_queues;
pub mod view_queue;
pub use view_all_queues::*;
pub use view_queue::*;

use crate::*;

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize)]
pub struct OracleQueueView {
    pub address: Uuid,
    pub name: Vec<u8>,
    pub metadata: Vec<u8>,
    pub authority: String,
    pub oracle_timeout: u32,
    pub reward: u128,
    pub min_stake: u128,
    pub slashing_enabled: bool,
    pub variance_tolerance_multiplier: SwitchboardDecimal,
    pub feed_probation_period: u32,
    pub curr_idx: u64,
    pub gc_idx: u64, // Garbage collection index
    pub consecutive_feed_failure_limit: u64,
    pub consecutive_oracle_failure_limit: u64,
    pub unpermissioned_feeds_enabled: bool,
    pub unpermissioned_vrf_enabled: bool,
    pub curator_reward_cut: SwitchboardDecimal,
    pub lock_lease_funding: bool,
    pub mint: String,
    pub enable_buffer_relayers: bool,
    pub max_size: u32,
    pub data: Vec<Uuid>,
}

impl Into<OracleQueueView> for OracleQueue {
    fn into(self) -> OracleQueueView {
        OracleQueueView {
            address: self.address,
            name: self.name,
            metadata: self.metadata,
            authority: self.authority.clone(),
            oracle_timeout: self.oracle_timeout,
            reward: self.reward,
            min_stake: self.min_stake,
            slashing_enabled: self.slashing_enabled,
            variance_tolerance_multiplier: self.variance_tolerance_multiplier,
            feed_probation_period: self.feed_probation_period,
            curr_idx: self.curr_idx,
            gc_idx: self.gc_idx,
            consecutive_feed_failure_limit: self.consecutive_feed_failure_limit,
            consecutive_oracle_failure_limit: self.consecutive_oracle_failure_limit,
            unpermissioned_feeds_enabled: self.unpermissioned_feeds_enabled,
            unpermissioned_vrf_enabled: self.unpermissioned_vrf_enabled,
            curator_reward_cut: self.curator_reward_cut,
            lock_lease_funding: self.lock_lease_funding,
            mint: self.mint,
            enable_buffer_relayers: self.enable_buffer_relayers,
            max_size: self.max_size,
            data: self.data.to_vec(),
        }
    }
}
