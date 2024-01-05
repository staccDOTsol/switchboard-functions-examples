use crate::*;

use base58::ToBase58;
use sgx_quote::Quote;
use sha2::{Digest, Sha256};

use hyper;
use hyper::server::Server;
use hyper::service::{make_service_fn, service_fn};
use hyper::{Body, Request, Response, StatusCode};
use switchboard_solana::{ChainResultInfo, LegacyFunctionResult};

use std::ops::Deref;
use std::{
    str::FromStr,
    sync::Arc,
    time::{Duration, SystemTime},
};

use tokio::sync::RwLock;

/// An event representing a quote verification request.
#[event]
#[derive(Debug, Clone)]
pub struct QuoteVerifyRequestEvent {
    /// The quote that is requesting verification.
    pub quote: Pubkey,
    /// The enclave verifying the quote.
    pub verifier: Pubkey,
}

/// Handles the verification of a quote by verifying its signature and comparing its report key hash
/// with the enclave signer's key hash. If the verification is successful, it builds and sends a
/// transaction to the Solana network to verify the quote.
///
/// # Arguments
///
/// * `client` - An `Arc` of `RwLock` of `AnchorClient` used to interact with the Solana network.
/// * `quote_key` - An `Arc` of `Pubkey` representing the public key of the quote to be verified.
/// * `enclave_key` - An `Arc` of `RwLock` of `Keypair` representing the keypair of the enclave.
/// * `payer` - An `Arc` of `Keypair` representing the keypair of the payer.
/// * `event` - A `QuoteVerifyRequestEvent` representing the event to be handled.
///
/// # Errors
///
/// Returns a `SbError` if any of the following occurs:
///
/// * The quote verification fails.
/// * The quote parsing fails.
/// * The quote data fetching fails.
/// * The attestation queue data fetching fails.
/// * The transaction compilation fails.
/// * The network error occurs.
/// * The quote is invalid.
pub async fn on_verify_event(
    client: Arc<RwLock<AnchorClient>>,
    quote_key: Arc<Pubkey>,
    enclave_key: Arc<RwLock<Keypair>>,
    payer: Arc<Keypair>,
    event: QuoteVerifyRequestEvent,
) {
    let res: Result<(), SbError> = (|| async move {
        // println!("{:#?}\n===", event);
        if event.verifier != *quote_key.clone() {
            println!("Not assigned...");
            return Ok(());
        }
        let rpc = client
            .read()
            .await
            .program(SWITCHBOARD_ATTESTATION_PROGRAM_ID)
            .unwrap()
            .async_rpc();
        let quote_data = VerifierAccountData::fetch_async(&rpc, event.quote)
            .await
            .map_err(|_| SbError::TxCompileErr)?;

        let ipfs = IPFSManager::new();
        let raw_quote: Vec<u8> = load_buffer(&quote_data, &ipfs).await?;
        let current_time = unix_timestamp();

        if !ecdsa_quote_verification(&raw_quote, current_time) {
            println!("Quote Verify failure...");
            return Ok(());
        }
        let quote = Quote::parse(&raw_quote).map_err(|_| SbError::QuoteParseError)?;
        let report_keyhash = &quote.isv_report.report_data[..32];
        if report_keyhash
            != Sha256::digest(&quote_data.enclave.enclave_signer.to_bytes()).as_slice()
        {
            return Err(SbError::InvalidQuoteError);
        }

        // let quote_parsed = quote_data.parsed().unwrap();
        let queue_data =
            AttestationQueueAccountData::fetch_async(&rpc, quote_data.attestation_queue).await?;
        let idx = queue_data
            .data
            .iter()
            .enumerate()
            .find_map(|(index, &value)| {
                if value == event.quote {
                    Some(index)
                } else {
                    None
                }
            })
            .unwrap_or_default();

        let quote_verify_ix = VerifierQuoteVerify::build_ix(VerifierQuoteVerifyArgs {
            quote: event.quote,
            verifier: event.verifier,
            enclave_signer: enclave_key.read().await.pubkey(),
            attestation_queue: quote_data.attestation_queue,
            timestamp: current_time,
            mr_enclave: quote.isv_report.mrenclave.try_into().unwrap(),
            idx: idx as u32,
        })
        .map_err(|_| SbError::TxCompileErr)?;

        let blockhash = rpc
            .get_latest_blockhash()
            .await
            .map_err(|_| SbError::Message("NetworkErr"))?;
        let tx = ix_to_tx(
            &[quote_verify_ix],
            &[&payer, enclave_key.read().await.deref()],
            blockhash,
        )?;
        let sig = rpc.send_and_confirm_transaction(&tx).await;
        println!("Verify signature {:?}", sig);
        Ok(())
    })()
    .await;
    if res.is_err() {
        println!("{:?}", res);
    }
}

/// Loads a buffer from IPFS using the registry key stored in the given `enclave` account data.
///
/// # Arguments
///
/// * `enclave` - The `VerifierAccountData` containing the registry key to use for loading the buffer.
/// * `ipfs` - The `IPFSManager` instance to use for retrieving the buffer from IPFS.
///
/// # Returns
///
/// A `Result` containing the loaded buffer as a `Vec<u8>`, or an `SbError` if an error occurred.
pub async fn load_buffer(
    enclave: &VerifierAccountData,
    ipfs: &IPFSManager,
) -> Result<Vec<u8>, SbError> {
    let mut cid = enclave.enclave.registry_key.clone().to_vec();
    // double check
    cid.retain(|x| *x != 0);
    ipfs.get_object(cid.to_base58())
        .await
        .map_err(|_| SbError::IpfsNetworkError)
}
