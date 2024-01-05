#![allow(unused_imports, unused_doc_comments)]
pub use kv_log_macro::{debug, error, info, trace};

pub mod env;
pub use env::*;

pub mod ipfs;
pub use ipfs::*;

pub mod quote_verify;
pub use quote_verify::*;

pub mod sgx;
pub use sgx::*;

use secret_vault::gcp::GcpSecretManagerSource;
use secret_vault::SecretVaultRef;
use secret_vault::SecretsSource;

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
pub use tokio::sync::RwLock;

pub use switchboard_common::SbError;

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

pub async fn gsm_get_secret(fqn: String) -> Result<String, SbError> {
    let parts: Vec<&str> = fqn.split("/").collect();
    let project_id = parts[1];
    let gsm_secret_ref = SecretVaultRef::new(parts[3].into())
        .with_required(false)
        .with_secret_version(parts[5].into());
    let gsm = GcpSecretManagerSource::new(project_id.into())
        .await
        .unwrap();
    let secrets = gsm
        .get_secrets(&[gsm_secret_ref.clone()])
        .await
        .map_err(|_| SbError::NetworkError)?;
    let res = secrets
        .get(&gsm_secret_ref)
        .unwrap()
        .value
        .as_sensitive_str()
        .to_string();
    Ok(res)
}

pub fn main() {
    // Access the version
    // let sbv3_version = env!("SBV3_VERSION");
    // println!("Version: {}", sbv3_version);

    femme::with_level(
        femme::LevelFilter::from_str(
            std::env::var("RUST_LOG")
                .unwrap_or("debug".to_string())
                .as_str(),
        )
        .unwrap_or(femme::LevelFilter::Debug),
    );

    let env = QvnEnvironment::parse().unwrap();

    // let payer_secret: String = env.payer_secret.unwrap_or_default();
    if env.payer_secret.unwrap_or_default().is_empty()
        && env
            .google_payer_secret_path
            .as_ref()
            .is_some_and(|s| !s.is_empty())
    {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let ps = gsm_get_secret(env.google_payer_secret_path.unwrap())
                .await
                .unwrap();
            std::env::set_var("PAYER_SECRET", ps);
        })
    }

    println!("Switchboard Attestation Service");
    unsafe {
        match env.chain.to_ascii_lowercase().as_str() {
            "solana" => solana_start(),
            "evm" => evm_start(),
            // "starknet" => starknet_start(),
            _ => panic!("Invalid chain {}", env.chain),
        }
    }
}
