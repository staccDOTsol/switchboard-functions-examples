// pub use kv_log_macro::{debug, error, info, trace};

pub mod metrics;
pub use metrics::*;

pub mod docker_utils;
pub use docker_utils::*;

pub mod env;
pub use env::*;

pub mod error;
pub use error::*;

pub mod network_watcher;
pub use network_watcher::init_network_watcher;

pub mod qvn;
pub use qvn::*;

use std::panic;
use std::result::Result;
use std::str::FromStr;
// use actix_web::{get, App, HttpRequest, HttpResponse, HttpServer, Responder};

type SBResult<T> = std::result::Result<T, Box<dyn std::error::Error>>;

#[link(name = "solana")]
extern "C" {
    fn solana_start();
}

#[link(name = "evm")]
extern "C" {
    fn evm_start();
}

// #[link(name = "starknet")]
// extern "C" {
//     fn starknet_start();
// }

#[tokio::main(worker_threads = 12)]
async fn main() -> SBResult<()> {
    println!("Starting v3 oracle");
    // ---

    // Set up logging
    femme::with_level(
        femme::LevelFilter::from_str(
            std::env::var("RUST_LOG")
                .unwrap_or("debug".to_string())
                .as_str(),
        )
        .unwrap_or(femme::LevelFilter::Debug),
    );
    // let metrics_route = warp::path("metrics").and_then(metrics_handler);

    // let _handle = tokio::spawn(async move {
    // warp::serve(metrics_route).run(([0, 0, 0, 0], 9090)).await;
    // });
    //example usages
    // RUNTIME_GAUGE.with_label_values(&[&Env::get().CHAIN, "example-function"]).set(42.0);
    // REQUEST_COUNTER.with_label_values(&[&Env::get().CHAIN, "example-function"]).inc();

    //set up a channel sender/reciever for blacklisting docker images
    // let (s, _r) = unbounded();
    // task::spawn(init_network_watcher(REQUEST_COUNTER.clone(), s));

    match Env::get().CHAIN.to_ascii_lowercase().as_str() {
        "solana" => unsafe { solana_start() },
        "evm" => unsafe { evm_start() },
        // "starknet" => unsafe { starknet_start() },
        _ => {
            panic!("No chain selected");
        }
    }
    // let (sr, or) = join!(server, oracle_runner);
    // (sr?, or?);
    Ok(())
}

// use reqwest::StatusCode;
// use warp::*;
// async fn metrics_handler() -> Result<impl Reply, Rejection> {
// let mut buffer = Vec::new();
// let encoder = TextEncoder::new();
// encoder.encode(&prometheus::gather(), &mut buffer).unwrap();
//
// let response = warp::reply::with_status(
// warp::reply::with_header(
// warp::reply::with_header(
// buffer,
// "content-type",
// "application/openmetrics-text; version=1.0.0; charset=utf-8",
// ),
// "cache-control",
// "no-cache",
// ),
// StatusCode::OK,
// );
// Ok(response)
// }
