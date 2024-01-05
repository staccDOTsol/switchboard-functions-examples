use crate::*;

use base64;
use base64::{engine::general_purpose, Engine as _};

use solana_client::nonblocking::rpc_client::RpcClient;
use solana_client::rpc_config::RpcTransactionLogsFilter;

use solana_sdk::hash::Hash;
use switchboard_solana::solana_client::nonblocking::pubsub_client::PubsubClient;
use switchboard_solana::solana_client::rpc_config::RpcTransactionLogsConfig;

use futures::StreamExt;

pub async fn subscribe<E, F, T>(
    program_id: Pubkey,
    url: &str,
    client: Arc<RwLock<AnchorClient>>,
    quote_key: Arc<Pubkey>,
    enclave_key: Arc<RwLock<Keypair>>,
    payer: Arc<Keypair>,
    f: F,
) where
    F: Fn(Arc<RwLock<AnchorClient>>, Arc<Pubkey>, Arc<RwLock<Keypair>>, Arc<Keypair>, E) -> T
        + Send
        + Sync
        + 'static,
    T: Future<Output = ()> + Send + 'static,
    E: Event,
{
    // TODO: This may pull events from other programs if targeted but the
    // request still goes through verification so not a fatal issue.
    loop {
        let pubsub_client = PubsubClient::new(url).await.unwrap();
        let res = pubsub_client
            .logs_subscribe(
                RpcTransactionLogsFilter::Mentions(vec![program_id.to_string()]),
                RpcTransactionLogsConfig {
                    commitment: Some(CommitmentConfig::processed()),
                },
            )
            .await;
        if res.is_err() {
            println!("ERROR Subscription failure");
            continue;
        }
        let (mut r, _handler) = res.unwrap();
        while let Some(event) = r.next().await {
            let log: String = event.value.logs.join(" ");
            for w in log.split(' ') {
                let decoded = general_purpose::STANDARD.decode(w);
                if decoded.is_err() {
                    continue;
                }
                let decoded = decoded.unwrap();
                if decoded.len() < 8 {
                    continue;
                }
                if decoded[..8] != E::DISCRIMINATOR {
                    continue;
                }
                let event = E::try_from_slice(&decoded[8..]);
                if event.is_ok() {
                    f(
                        client.clone(),
                        quote_key.clone(),
                        enclave_key.clone(),
                        payer.clone(),
                        event.unwrap(),
                    )
                    .await;
                }
            }
        }
    }
}
