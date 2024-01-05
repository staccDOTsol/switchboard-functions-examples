#[macro_use]
extern crate log;
mod cli;
mod docker;

use miette::Result;
use tokio::time::Duration;
use tokio_graceful_shutdown::Toplevel;

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize and run subsystems
    Toplevel::new()
        .start("sb-func-tools", cli::run)
        .catch_signals()
        .handle_shutdown_requests(Duration::from_millis(1000))
        .await
        .map_err(Into::into)
}
