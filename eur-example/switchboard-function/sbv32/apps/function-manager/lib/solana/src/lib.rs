pub use kv_log_macro::{debug, error, info, trace, warn};
use std::collections::HashMap;
use std::collections::HashSet;
use std::time::Duration;
use std::time::SystemTime;
use tokio::sync::RwLock;

pub use anchor_client;
use anchor_client::Client;
use bollard::Docker;
pub use switchboard_container_utils::{
    Container, ContainerManager, DockerContainer, DockerManager,
};
pub use switchboard_solana::prelude::*;

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
#[macro_use]
pub mod metrics;
use metrics::*;

pub mod routines;
pub use routines::*;

pub mod events;
pub use events::*;

pub mod context;
pub use context::*;

pub mod sdk;
pub use sdk::*;

use actix_web::App;
use actix_web::HttpServer;
use actix_web::{get, HttpRequest, HttpResponse, Responder};
use anchor_client::solana_sdk::signature::Signer;
use async_channel;
use prometheus::{self, Encoder, TextEncoder};
use solana_sdk::signer::keypair::read_keypair;
use std::io::Cursor;
use std::result::Result;
use std::str::FromStr;
use std::sync::Arc;
use switchboard_solana::find_associated_token_address;
use tokio::join;
use tokio::runtime::Builder;
use tokio::sync::mpsc;

#[macro_export]
macro_rules! clone {
    ($($var:ident),*) => {
        $(let $var = $var.clone();)*
    };
}

#[no_mangle]
pub extern "C" fn solana_start() {
    let rt = Builder::new_multi_thread()
        .worker_threads(6)
        .enable_all()
        .build()
        .unwrap();
    rt.block_on(async move {
        start().await.unwrap();
    });
}

fn load_client() -> Result<(Client<Arc<Keypair>>, Pubkey, Pubkey), SbError> {
    let payer = read_keypair(&mut Cursor::new(&Env::get().PAYER_SECRET)).unwrap();
    let payer_pubkey = payer.pubkey();
    let receiver = find_associated_token_address(&payer_pubkey, &NativeMint::ID);
    let anchor_client = anchor_client::Client::new_with_options(
        anchor_client::Cluster::Custom(Env::get().RPC_URL.clone(), Env::get().WSS_URL.clone()),
        Arc::new(payer),
        solana_sdk::commitment_config::CommitmentConfig::processed(),
    );
    Ok((anchor_client, payer_pubkey, receiver))
}

pub async fn start() -> Result<(), SbError> {
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
    let metrics_server = HttpServer::new(move || App::new().service(index))
        .bind(("0.0.0.0", 9090))
        .unwrap()
        .run();
    label!(BOOT_COUNTER, []).inc();

    let (anchor_client, payer_pubkey, receiver) = load_client()?;

    let docker: Docker = Docker::connect_with_unix_defaults().unwrap();
    let container_manager: Arc<DockerManager> =
        Arc::new(DockerManager::new(Arc::new(docker.clone()), None));

    // Load the QVN then wait for it to initialize before starting any other routines
    // TODO: we should load all functions and start fetching their containers here
    let qvn = Arc::new(Qvn::new(Env::get().LOCAL_QVN).await);
    let qvn_watcher = qvn.clone().watch(docker.clone());
    qvn_watcher.await.unwrap();

    // Container Downloader Channel
    let (container_download_tx, container_download_rx) = mpsc::unbounded_channel::<String>();

    // Container Runner Channel
    let (container_runner_tx, container_runner_rx) =
        async_channel::unbounded::<ContainerRunnerCtx>();

    // Start looking for functions to execute
    let processing_keys = Arc::new(RwLock::new(HashSet::<String>::new()));
    let backoff_map = Arc::new(RwLock::new(HashMap::<String, (SystemTime, Duration)>::new()));
    let last_ex_map: Arc<RwLock<HashMap<String, u64>>> = Default::default();
    let fn_watcher = tokio::spawn(function_check_routine(
        processing_keys.clone(),
        backoff_map.clone(),
        last_ex_map.clone(),
        anchor_client,
        qvn.clone(),
        container_runner_tx,
        container_download_tx.clone(),
    ));

    // // Start looking for containers to download
    let container_downloader_handle = tokio::spawn(container_download_routine(
        docker.clone(),
        container_download_rx,
    ));

    // Start looking for containers to run
    let runner_ops = ContainerRunRoutineOptions {
        rx: container_runner_rx.into(),
        container_downloader_chan: container_download_tx.into(),
        payer: payer_pubkey.to_string(),
        reward_receiver: receiver.to_string(),
        verifier: Env::get().QUOTE_KEY.clone(),
        cluster: Env::get().CLUSTER.clone(),
    };
    let container_runner_handle = container_runner_routine(
        processing_keys,
        backoff_map,
        last_ex_map.clone(),
        container_manager,
        qvn,
        runner_ops,
    );

    tokio::select! {
        fn_watcher_result = fn_watcher => {
            panic!("Function Watcher routine failed: {:#?}", fn_watcher_result);
        }
        container_download_result = container_downloader_handle => {
            panic!("Container Downloader routine failed: {:#?}", container_download_result);
        }
        container_runner_result = container_runner_handle => {
            panic!("Container Runner routine failed: {:#?}", container_runner_result);
        }
        metrics_server_result = metrics_server => {
            panic!("Metrics server stopped: {:#?}", metrics_server_result);
        }
    }
}

#[get("/metrics")]
pub async fn index(_req: HttpRequest) -> impl Responder {
    let mut buf = Vec::new();
    TextEncoder::encode(&TextEncoder::new(), &prometheus::gather(), &mut buf).unwrap();
    let body: actix_web::web::Bytes = buf.into();
    HttpResponse::Ok()
        .content_type("application/openmetrics-text; version=1.0.0; charset=utf-8")
        .body(body)
}
