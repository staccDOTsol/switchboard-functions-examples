use crate::*;

use futures_util::Future;
use std::pin::Pin;

pub type FutureResult<'a, T> = Pin<Box<dyn Future<Output = Result<T, SbError>> + Send + 'a>>;

/// A container waiting to run.
// This struct should contian everything needed to start a Switchboard function
// container, including its cache keys.
pub struct PendingContainer {
    pub name: String,
    pub image: String,
    pub env: SolanaFunctionEnvironment,
}

pub struct ActiveFunction {
    pub pubkey: Pubkey,
    pub bounty: u64,
    pub next_allowed_timestamp: i64,
}

pub struct ActiveRoutine {
    pub pubkey: Pubkey,
    pub bounty: u64,
    // we can use this to invalidate a function run if stale
    pub next_allowed_timestamp: i64,
}

pub struct RoutineCache {
    pub last_successful_execution: Arc<DashMap<Pubkey, SystemTime>>,
    pub active_requests: Arc<DashMap<Pubkey, SystemTime>>,
}
pub struct ActiveRequest {
    pub pubkey: Pubkey,
    pub bounty: u64,
    // we can use this to invalidate a function run if stale
    pub request_slot: u64,
}

pub enum ActiveFunctionResource {
    Function(ActiveFunction),
    Routine(ActiveRoutine),
    Request(ActiveRequest),
}

/// The container that is currently active
pub struct ActiveContainer {
    pub container_id: String,
    pub image_name: String,
    pub timestamp: i64,
    pub resource: ActiveFunctionResource,
}
