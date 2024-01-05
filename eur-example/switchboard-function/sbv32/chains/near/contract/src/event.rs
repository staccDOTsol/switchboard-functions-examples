use crate::*;
use near_sdk::serde::Serialize;
use near_sdk::{env, serde_json};

// https://is.gd/14MLv1
pub trait NearEvent {
    fn to_json_string(&self) -> String
    where
        Self: Serialize,
    {
        // Events cannot fail to serialize so fine to panic on error
        #[allow(clippy::redundant_closure)]
        serde_json::to_string(self)
            .ok()
            .unwrap_or_else(|| env::abort())
    }

    fn to_json_event_string(&self) -> String
    where
        Self: Serialize,
    {
        format!(
            "EVENT_JSON:{{ \"standard\": \"nep297\", \"version\": \"1.0.0\", \"event\": \"{}\", \"data\": {} }}",
            self.event_type(),
            self.to_json_string()
        )
    }

    /// Logs the event to the host. This is required to ensure that the event is triggered
    /// and to consume the event.
    fn emit(&self)
    where
        Self: Serialize,
    {
        near_sdk::env::log_str(&self.to_json_event_string());
    }

    fn event_type(&self) -> &str {
        std::any::type_name::<Self>().rsplit_once("::").unwrap().1
    }
}

#[derive(Serialize, Debug)]
pub struct AggregatorOpenRoundEvent {
    pub feed_key: Uuid,
    pub oracles: Vec<Uuid>,
    pub jobs: Vec<Uuid>,
}
impl NearEvent for AggregatorOpenRoundEvent {}

#[derive(Serialize, Debug)]
pub struct AggregatorValueUpdateEvent {
    pub feed_key: Uuid,
    pub oracles: Vec<Uuid>,
    pub oracle_values: Vec<SwitchboardDecimal>,
    pub timestamp: u64,
    pub round_id: u128,
    pub value: SwitchboardDecimal,
}
impl NearEvent for AggregatorValueUpdateEvent {}

#[derive(Serialize, Debug)]
pub struct OracleSlashEvent {
    pub feed: Uuid,
    pub oracle: Uuid,
    pub amount: u128,
    pub round_id: u128,
    pub timestamp: u64,
}
impl NearEvent for OracleSlashEvent {}

#[derive(Serialize, Debug)]
pub struct OracleRewardEvent {
    pub feed_key: Uuid,
    pub oracle_key: Uuid,
    pub amount: u128,
    pub round_id: u128,
    pub timestamp: u64,
}
impl NearEvent for OracleRewardEvent {}

#[derive(Serialize, Debug)]
pub struct OracleBootedEvent {
    pub oracle: Uuid,
    pub queue: Uuid,
    pub timestamp: u64,
}
impl NearEvent for OracleBootedEvent {}
