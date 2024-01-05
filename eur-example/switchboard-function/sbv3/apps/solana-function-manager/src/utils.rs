use crate::*;

use std::io::Cursor;
use switchboard_common::FunctionManagerEnvironment;
use switchboard_solana::find_associated_token_address;
use switchboard_solana::solana_sdk::signer::Signer;
use switchboard_solana::{ anchor_client::Client, solana_sdk::signer::keypair::read_keypair };
use tokio::sync::Mutex;
use tokio::time::{ interval, Interval };

pub fn read_and_trim_file(file_path: &str) -> Result<String, Box<dyn std::error::Error>> {
    // Check if the file exists
    if !std::path::Path::new(file_path).exists() {
        return Err(
            Box::new(
                std::io::Error::new(
                    std::io::ErrorKind::NotFound,
                    format!("File not found: {}", file_path)
                )
            )
        );
    }

    // Read the file to a String
    let content = std::fs::read_to_string(file_path)?;

    // Trim the content and return it
    Ok(content.trim().to_string())
}

pub fn load_client(
    env: &FunctionManagerEnvironment
) -> Result<(Client<Arc<Keypair>>, Arc<Keypair>, Pubkey, Pubkey), SbError> {
    let payer_secret = read_and_trim_file(&env.payer_secret).unwrap();
    let payer = Arc::new(read_keypair(&mut Cursor::new(&payer_secret)).unwrap());
    let payer_pubkey = payer.pubkey();
    let receiver = find_associated_token_address(&payer_pubkey, &NativeMint::ID);
    let anchor_client = anchor_client::Client::new_with_options(
        anchor_client::Cluster::from_str(env.rpc_url.as_str()).unwrap_or_default(),
        payer.clone(),
        solana_sdk::commitment_config::CommitmentConfig::processed()
    );
    Ok((anchor_client, payer, payer_pubkey, receiver))
}

pub async fn start_routine<F, Fut>(routine_interval: u64, mut async_fn: F) -> Result<(), SbError>
    where F: FnMut() -> Fut, Fut: std::future::Future<Output = Result<(), SbError>>
{
    let mut interval: Interval = interval(Duration::from_secs(std::cmp::max(1, routine_interval)));
    interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);

    start_routine_from_interval(interval, async_fn).await
}

pub async fn start_routine_from_interval<F, Fut>(
    mut interval: Interval,
    mut async_fn: F
)
    -> Result<(), SbError>
    where F: FnMut() -> Fut, Fut: std::future::Future<Output = Result<(), SbError>>
{
    // let counter = Arc::new(Mutex::new(1));

    loop {
        interval.tick().await; // This waits for the next tick (every 1 second)
        // let current_counter = {
        //     let mut locked_counter = counter.lock().await;
        //     let val = *locked_counter;
        //     *locked_counter += 1;
        //     val
        // };

        // Run custom async fn here
        async_fn().await?;
    }
}
