#![allow(unused_imports, unused_doc_comments)]
pub use kv_log_macro::{debug, error, info, trace};
use crate::anchor_client::Cluster;
use crate::oracle::load_enclave_secured_signer;

#[path = "../../../src/quote_verify/mod.rs"]
mod quote_verify;
pub use quote_verify::*;

#[path = "../../../src/env/mod.rs"]
mod env;
pub use env::*;

#[path = "../../../src/ipfs/mod.rs"]
mod ipfs;
pub use ipfs::*;

// #[path = "../../../src/error/mod.rs"]
// mod error;
// pub use error::*;

// #[path = "../../../src/sgx/mod.rs"]
// mod sgx;
// pub use sgx::*;

pub mod events;
pub use events::*;

pub mod utils;
pub use utils::*;

pub mod oracle;

pub mod routines;
pub use routines::*;

pub mod subscribe;
pub use subscribe::*;

use std::sync::OnceLock;

// Switchboard Deps
pub use switchboard_solana::env::qvn::QvnEnvironment;
pub use switchboard_solana::prelude::*;
pub use switchboard_solana::{find_associated_token_address, ipfs::IpfsManager, Gramine, SbError};

// Solana Deps
pub use anchor_lang::Event;
pub use solana_client::nonblocking::rpc_client::RpcClient;
pub use solana_client::rpc_config::RpcTransactionLogsFilter;
pub use solana_sdk::{
    commitment_config::CommitmentConfig,
    hash::Hash,
    message::Message,
    pubkey::Pubkey,
    signature::Signer,
    signer::keypair::Keypair,
    signer::keypair::{keypair_from_seed, read_keypair},
    transaction::Transaction,
};

// Std Lib
pub use base58::FromBase58;
pub use sha2::{Digest, Sha256};
pub use std::fs;
pub use std::future::Future;
pub use std::ops::Deref;
pub use std::result::Result;
pub use std::str::FromStr;
pub use std::sync::Arc;
pub use std::time::{Duration, SystemTime};
use tokio::sync::oneshot;
pub use tokio::sync::RwLock;
use tokio::runtime::{Builder, Runtime};
use tokio::task::spawn_blocking;
use lazy_static::lazy_static;
use tokio::runtime::Handle;

lazy_static! {
    static ref RUNTIME: Runtime = Builder::new_multi_thread()
        .enable_all() // Enables both I/O and time drivers
        .build()
        .expect("Failed to create Tokio runtime");
}
pub fn get_handle() -> Handle {
    RUNTIME.handle().clone()
}

pub fn get_qvn_env() -> &'static QvnEnvironment {
    static ENV: OnceLock<QvnEnvironment> = OnceLock::new();
    ENV.get_or_init(|| QvnEnvironment::parse().unwrap())
}

#[no_mangle]
pub extern "C" fn solana_start() {
    let env: &'static QvnEnvironment = get_qvn_env();

    let url = env.rpc_url.clone();
    let cluster: Cluster = Cluster::from_str(url.as_str()).unwrap_or(Cluster::Custom(
        env.rpc_url.clone(),
        env.rpc_url.replace("https://", "wss"),
    ));
    let ws_url = cluster.ws_url().to_string();
    let ss = load_enclave_secured_signer("/data/protected_files/keypair.bin").unwrap();
    let client = AnchorClient::new_with_options(
        cluster,
        ss,
        CommitmentConfig::processed(),
    );
    let program = Arc::new(client.program(SWITCHBOARD_ATTESTATION_PROGRAM_ID).unwrap());
    get_handle().block_on(async {
        oracle::start(program).await.unwrap();
    });
}
