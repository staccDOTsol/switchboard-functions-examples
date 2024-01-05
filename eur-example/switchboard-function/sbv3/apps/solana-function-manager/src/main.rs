#![allow(dead_code, unused)]
pub mod oracle;
pub use oracle::*;

pub mod utils;

pub mod types;
pub use types::*;

pub use anchor_client::Client;
pub use dashmap::{ DashMap, DashSet };
use dotenvy::dotenv;
pub use solana_sdk::signer::keypair::read_keypair;
pub use std::str::FromStr;
pub use std::sync::Arc;
pub use std::time::{ Duration, SystemTime };
pub use switchboard_solana::anchor_client;
pub use switchboard_solana::prelude::*;
pub use switchboard_solana::solana_sdk;
pub use switchboard_node::*;

// Threads / Tokio Runtimes
// Thread 1 (main): Responsible for initializing the worker queue and oracle, then fetching and populating the cache
// Thread 2 (qvn): Responsible for running the qvn container in a non-blocking context so we have a readily avaialble verifier with no slow downs
// Thread 3-N (workers): Responsible for running the containers and relaying results to the QVN. Uses its own dedicated runtime

// Questions
// * Should each be run in their own dedicated runtime?
// * Does bollard/docker handle running containers in their own threads? What guarantees can I have that my main thread wont be blocked by docker?
// * Is the rayon crate better for thread parallelism?

// Answers
// * No, docker is run as a separate process so it wont block the main thread
// * Moot, Docker is run in its own process - no need to manage runtimes or threads
// * No, We arent doing much CPU intensive calculations - mostly waiting on docker

// Obervations
// * Cointainers should be scheduled based on available OS resources to determine ready status. Use bounty to prioritize execution. Might make the Injector queue a bad design decision, maybe a vec is ok.
// * Our architecture should handle horizontally scaling. The container execution process should be handled behind a Load Balancer and forward the logs to the oracle. Opens up k8s attack surface.
// * Need to determine a good docker layer caching strategy. We could have a service to periodically fetch all docker layers across chains every 5 minutes and store in some kind of public S3 bucket for operators to pull from.

// Docker Caching
// * Look into setting up a docker image cache repository
// * See if theres a way to emit and store the name of containers that were executed within the last 15 minutes
// * Look into a k8s cron job that pre-fetches docker layers. Is there a way to schedule container executors on these nodes only? Maybe by chain too? Does node pool share docker cache?

// /b/
// * Maybe spin up websocket events in separate threads to prevent blocking?\
// * It probably makes sense to run the event scheduler & cache in a single thread and use the rest of the threads for running containers.

#[tokio::main]
async fn main() -> Result<(), SbError> {
    dotenv().ok();

    // Set up logging - might not be needed since its handled by entrypoint
    femme::with_level(
        femme::LevelFilter
            ::from_str(std::env::var("RUST_LOG").unwrap_or("info".to_string()).as_str())
            .unwrap_or(femme::LevelFilter::Info)
    );

    println!("Hello, world!");

    let mut oracle = SolanaFunctionManager::new().await?;

    // Start QVN, fetch docker layers, start health checker
    oracle.initialize().await;

    // Start watching the chain for new functions to run
    oracle.start().await;

    panic!("Function Manager crashed!");
}
