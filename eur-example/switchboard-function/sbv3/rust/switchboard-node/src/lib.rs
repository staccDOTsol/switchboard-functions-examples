use async_trait::async_trait;
pub use switchboard_common::SbError;
pub use switchboard_node_health::*;
pub use switchboard_node_metrics::*;

#[async_trait]
pub trait SwitchboardFunctionManager: Send + Sync + Sized {
    async fn new() -> Result<Self, SbError>;
    async fn initialize(&mut self) -> Result<(), SbError>;
    async fn start(&mut self);
    async fn start_qvn(&self) -> Result<(), SbError>;
}
