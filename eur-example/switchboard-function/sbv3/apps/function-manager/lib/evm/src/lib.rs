pub use kv_log_macro::{debug, error, info, trace, warn};

pub mod routines;
pub use routines::*;

pub mod sdk;
pub use sdk::*;

use ethers::prelude::*;
use ethers::{
    core::types::Address,
    middleware::SignerMiddleware,
    providers::{Http, Provider},
    signers::LocalWallet,
};
// use actix_web::App;
// use actix_web::HttpServer;
// use actix_web::{get, HttpRequest, HttpResponse, Responder};
use std::net::SocketAddr;
use hyper::Server;
use hyper::service::{make_service_fn, service_fn};
use hyper::{Body, Request, Response, StatusCode};
use hyper::header::{CONTENT_TYPE, HeaderValue};
use std::convert::Infallible;
use prometheus::{self, Encoder, TextEncoder};

use bollard::Docker;
pub use sdk::*;
use std::result::Result;
use std::str::FromStr;
use std::sync::Arc;

use tokio::join;
use tokio::runtime::Builder;
use tokio::sync::mpsc;

pub mod events;
pub use events::*;

#[path = "../../../src/qvn/mod.rs"]
pub mod qvn;
pub use qvn::*;

#[path = "../../../src/env/mod.rs"]
pub mod env;
pub use env::*;

#[path = "../../../src/error.rs"]
pub mod error;
pub use error::*;

#[path = "../../../src/docker_utils/mod.rs"]
pub mod docker_utils;
pub use docker_utils::*;

#[path = "../../../src/metrics/mod.rs"]
pub mod metrics;
use metrics::*;

#[no_mangle]
pub extern "C" fn evm_start() {
    let rt = Builder::new_multi_thread()
        .worker_threads(25)
        .enable_all()
        .build()
        .unwrap();
    rt.block_on(async move {
        start().await.unwrap();
    });
}

pub async fn start() -> Result<(), Err> {
    println!("Starting EVM oracle");
    println!("{}", Env::get());

    // Set up logging - might not be needed since its handled by entrypoint
    femme::with_level(
        femme::LevelFilter::from_str(
            std::env::var("RUST_LOG")
                .unwrap_or("info".to_string())
                .as_str(),
        )
        .unwrap_or(femme::LevelFilter::Info),
    );

    init_metrics().await;
    // let metrics_server = HttpServer::new(move || App::new().service(index))
        // .bind(("0.0.0.0", 9090))
        // .unwrap()
        // .run();
    let make_svc = make_service_fn(|_conn| {
        async { Ok::<_, Infallible>(service_fn(metrics_handler)) }
    });
    let addr = SocketAddr::from(([0, 0, 0, 0], 9090));
    let metrics_server = tokio::spawn(Server::bind(&addr).serve(make_svc));
    label!(BOOT_COUNTER, []).inc();

    let docker = Docker::connect_with_unix_defaults().unwrap();

    let contract_address = &Env::get().CONTRACT_ADDRESS;
    let chain_id: u64 = Env::get().CHAIN_ID;

    // get EVM payer
    let payer = &Env::get().PAYER_SECRET;
    let enclave_key = &Env::get().QUOTE_KEY.parse::<Address>().unwrap();

    // grab rpc url
    let url = &Env::get().RPC_URL;

    let contract_address: Address = contract_address.parse::<Address>().unwrap();
    // setup provider + signer
    let provider = Provider::<Http>::try_from(url).unwrap();
    let payer = LocalWallet::from_bytes(&hex::decode(payer).unwrap()).unwrap();
    let payer = payer.with_chain_id(chain_id);
    let payer_client = SignerMiddleware::new(provider.clone(), payer.clone());

    // set up payer contract for node initialization and permissions
    let payer_contract = Switchboard::new(contract_address, payer_client.clone().into());

    // get enclave data for reward receiver
    let verifier_data = payer_contract.enclaves(*enclave_key).call().await.unwrap();

    // set QUEUE if not already set, not set in Env object still
    if std::env::var("QUEUE").is_err() {
        let queue = format!("{:#?}", verifier_data.queue_id);
        std::env::set_var("QUEUE", queue);
    }

    let qvn = Arc::new(Qvn::new(Env::get().LOCAL_QVN).await);
    let qvn_watcher = qvn.clone().watch(docker.clone());
    let (dtx, drx) = mpsc::unbounded_channel::<String>();
    let (rtx, rrx) = mpsc::unbounded_channel::<ContainerRunnerCtx>();
    let (atx, arx) = mpsc::unbounded_channel();
    let mqvn = qvn.clone();
    let fn_watcher = tokio::spawn(async move {
        function_check_routine(payer_contract, &mqvn, rtx).await;
    });
    let mdocker = docker.clone();
    let cdf = tokio::spawn(async move {
        container_download_routine(mdocker, drx).await;
    });
    let caf = tokio::spawn(async move {
        container_awaiter_routine(arx).await;
    });

    let runner_ops = ContainerRunRoutineOptions {
        rx: rrx,
        container_downloader_chan: dtx,
        container_awaiter_chan: atx,
        payer: format!("{:?}", payer.address()),
        reward_receiver: format!("{:?}", verifier_data.authority),
        verifier: Env::get().QUOTE_KEY.clone(),
        verifying_contract: Env::get().CONTRACT_ADDRESS.clone(),
        chain_id: Env::get().CHAIN_ID.to_string(),
    };

    let mdocker = docker.clone();
    let crf = tokio::spawn(async move {
        container_runner_routine(&mdocker, qvn, runner_ops).await;
    });

    let (f1, f2, f3, f4, f5, f6) = join!(qvn_watcher, fn_watcher, cdf, caf, crf, metrics_server);
    (
        f1.unwrap(),
        f2.unwrap(),
        f3.unwrap(),
        f4.unwrap(),
        f5.unwrap(),
        f6.unwrap().unwrap(),
    );
    Ok(())
}

async fn metrics_handler(_req: Request<Body>) -> Result<Response<Body>, Infallible> {
    let mut buf = Vec::new();
    let encoder = TextEncoder::new();
    encoder.encode(&prometheus::gather(), &mut buf).unwrap();

    let response = Response::builder()
        .status(StatusCode::OK)
        .header(CONTENT_TYPE, "application/openmetrics-text; version=1.0.0; charset=utf-8")
        .body(Body::from(buf))
        .unwrap();

    Ok(response)
}
