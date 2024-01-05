pub mod view_aggregator;
pub mod view_aggregator_expanded_info;
pub mod view_aggregator_history;
pub mod view_aggregator_keys;
pub mod view_aggregators_on_queue;
pub mod view_aggregators_state_with_authority;
pub mod view_aggregators_with_authority;
pub use view_aggregator::*;
pub use view_aggregator_expanded_info::*;
pub use view_aggregator_history::*;
pub use view_aggregator_keys::*;
pub use view_aggregators_on_queue::*;
pub use view_aggregators_state_with_authority::*;
pub use view_aggregators_with_authority::*;

use crate::*;

#[derive(Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
pub struct AggregatorView {
    pub address: Uuid,
    pub name: Vec<u8>,
    pub metadata: Vec<u8>,
    pub queue: Uuid,
    // CONFIGS
    pub oracle_request_batch_size: u32,
    pub min_oracle_results: u32,
    pub min_job_results: u32,
    pub min_update_delay_seconds: u32,
    pub start_after: u64, // timestamp to start feed updates at
    pub variance_threshold: SwitchboardDecimal,
    pub force_report_period: u64, // If no feed results after this period, trigger nodes to report
    pub expiration: u64,
    //
    pub consecutive_failure_count: u64,
    pub next_allowed_update_time: u64,
    pub is_locked: bool,
    pub crank: Uuid,
    pub crank_row_count: u32,
    pub latest_confirmed_round: AggregatorRound,
    pub current_round: AggregatorRound,
    pub jobs: Vec<Uuid>,
    pub jobs_checksum: Vec<u8>, // Used to confirm with oracles they are answering what they think theyre answering
    //
    pub authority: String,
    // Maybe keep as separate account so no need to parse on lookup table?
    // pub history: Vec<AggregatorHistoryRow>,
    // pub history_write_idx: u64,
    pub history_limit: u64,
    pub previous_confirmed_round_result: SwitchboardDecimal,
    pub previous_confirmed_round_slot: u64,
    pub job_weights: Vec<u8>,
    pub creation_timestamp: u64,
    pub read_charge: u128,
    pub reward_escrow: Uuid,
}

impl Into<AggregatorView> for Aggregator {
    fn into(self) -> AggregatorView {
        AggregatorView {
            address: self.address,
            name: self.name,
            metadata: self.metadata,
            queue: self.queue,
            oracle_request_batch_size: self.oracle_request_batch_size,
            min_oracle_results: self.min_oracle_results,
            min_job_results: self.min_job_results,
            min_update_delay_seconds: self.min_update_delay_seconds,
            start_after: self.start_after,
            variance_threshold: self.variance_threshold,
            force_report_period: self.force_report_period,
            expiration: self.expiration,
            consecutive_failure_count: self.consecutive_failure_count,
            next_allowed_update_time: self.next_allowed_update_time,
            is_locked: self.is_locked,
            crank: self.crank,
            crank_row_count: self.crank_row_count,
            latest_confirmed_round: self.latest_confirmed_round,
            current_round: self.current_round,
            jobs: self.jobs,
            jobs_checksum: self.jobs_checksum,
            authority: self.authority,
            // history: self.history.to_vec(),
            // history_write_idx: self.history_write_idx,
            history_limit: self.history_limit,
            previous_confirmed_round_result: self.previous_confirmed_round_result,
            previous_confirmed_round_slot: self.previous_confirmed_round_slot,
            job_weights: self.job_weights,
            creation_timestamp: self.creation_timestamp,
            read_charge: self.read_charge,
            reward_escrow: self.reward_escrow,
        }
    }
}

#[derive(Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
pub struct AggregatorHistoryPageView {
    pub address: Uuid,
    pub history: Vec<AggregatorHistoryRow>,
    pub history_write_idx: u64,
    pub history_limit: u64,
    pub page: u32,
    pub starting_idx: u32,
    pub ending_idx: u32,
}
