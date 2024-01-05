use crate::*;

use std::ops::Deref;
use std::time::Duration;
use tokio::sync::RwLock;

use tokio::time::{interval, Interval};

macro_rules! fail_open {
    ($result:expr) => {
        match $result {
            Err(err) => {
                println!("({}), ({}) Error: {}", file!(), line!(), err);
                continue;
            }
            Ok(value) => value,
        }
    };
}

pub async fn heartbeat_routine(
    program: Arc<anchor_client::Program<Arc<Keypair>>>,
    client: Arc<RwLock<AnchorClient>>,
    payer: &Keypair,
    verifier: Pubkey,
    enclave_signer: Arc<RwLock<Keypair>>,
    attestation_queue: Pubkey,
) {
    let mut interval: Interval = interval(Duration::from_secs(
        Env::get().HEARTBEAT_INTERVAL.try_into().unwrap(),
    ));
    loop {
        interval.tick().await;

        let rpc = program.async_rpc();

        let (blockhash_result, verifier_data_result, queue_data_result) = tokio::join!(
            rpc.get_latest_blockhash(),
            VerifierAccountData::fetch_async(&rpc, verifier),
            AttestationQueueAccountData::fetch_async(&rpc, attestation_queue)
        );
        let blockhash = blockhash_result.unwrap_or_default();
        let verifier_data = verifier_data_result.unwrap();
        let queue_data = queue_data_result.unwrap();

        // Verify we have the right enclave signer
        let enclave_signer = enclave_signer.read().await;
        if verifier_data.enclave.enclave_signer != enclave_signer.pubkey() {
            println!("Enclave signer mismatch, failed to heartbeat!");
            continue;
        }

        let mut gc_node = queue_data.data[queue_data.gc_idx as usize];
        if gc_node == Pubkey::default() {
            gc_node = verifier;
        }

        let quote_heartbeat_ix = fail_open!(VerifierHeartbeat::build_ix(VerifierHeartbeatArgs {
            verifier,
            enclave_signer: verifier_data.enclave.enclave_signer,
            attestation_queue: verifier_data.attestation_queue,
            queue_authority: queue_data.authority,
            gc_node
        }));

        // let blockhash = fail_open!(rpc.get_latest_blockhash().await);
        let tx = ix_to_tx(
            &[quote_heartbeat_ix],
            &[payer, enclave_signer.deref()],
            blockhash,
        );

        if tx.is_err() {
            println!("QVN HEARTBEAT FAILURE: {}", tx.err().unwrap());
            // let url = Env::get().RPC_URL.to_string();
            // let wss_url = url.replace("https://", "wss://");
            // let cluster = Cluster::Custom(url.clone(), wss_url.clone());
            // let keypair_path = "/data/protected_files/keypair.bin";
            // std::fs::remove_file(keypair_path).ok();
            // let unwrapped_signer = load_enclave_secured_signer(keypair_path).unwrap();
            // let key: Pubkey = unwrapped_signer.pubkey();
            // let munwrapped_signer = Keypair::from_bytes(&unwrapped_signer.to_bytes()).unwrap();
            // let uclient = AnchorClient::new_with_options(
            // cluster,
            // unwrapped_signer.clone(),
            // CommitmentConfig::processed(),
            // );
            // let quote_rotate_ix = fail_open!(
            // QuoteRotate::build(
            // &uclient,
            // QuoteRotateArgs {
            // quote: quote.clone(),
            // secured_signer: key,
            // data: Gramine::generate_quote(&key.to_bytes()).unwrap(),
            // },
            // vec![&payer],
            // )
            // .await
            // );
            // let blockhash = fail_open!(rpc.get_latest_blockhash().await);
            // println!("TX BUILD");
            // let tx = ix_to_tx(&[quote_rotate_ix.clone()], &[&payer], blockhash).unwrap();
            // println!("Rotating quote key..");
            // let sig = rpc.send_and_confirm_transaction(&tx).await.unwrap();
            // println!("Quote rotate signature {:?}", sig);
            // *client.write().await = uclient;
            // *enclave_signer.write().await = munwrapped_signer;
            continue;
        }
        let sig = fail_open!(rpc.send_and_confirm_transaction(&tx.unwrap()).await);
        println!("Heartbeat {:#?}", sig);
        let verifier_data: VerifierAccountData =
            fail_open!(VerifierAccountData::fetch_async(&rpc, verifier).await);
        println!(
            "Quote Status: {:#?}",
            verifier_data.enclave.verification_status
        );
    }
}
