use crossbeam::deque::{Injector, Steal};
use dashmap::DashMap;
use futures_util::future::join_all;
use std::io::Cursor;
use std::sync::OnceLock;
use std::{sync::Arc, time::Duration};
use switchboard_solana::anchor_client::Client;
use switchboard_solana::solana_sdk::commitment_config::CommitmentConfig;
use switchboard_solana::solana_sdk::signature::read_keypair;
use switchboard_solana::{anchor_client::Program, Keypair, Pubkey};
use switchboard_solana::{
    Cluster, FunctionAccountData, FunctionRequestAccountData, FunctionRoutineAccountData,
    SWITCHBOARD_ATTESTATION_PROGRAM_ID,
};
use tokio::sync::RwLock;
use tokio::time::sleep;

// TODO: we dont need to store the whole account
fn get_function_accounts() -> &'static DashMap<String, FunctionAccountData> {
    static MEM: OnceLock<DashMap<String, FunctionAccountData>> = OnceLock::new();
    MEM.get_or_init(DashMap::new)
}

fn get_request_accounts() -> &'static DashMap<String, FunctionRequestAccountData> {
    static MEM: OnceLock<DashMap<String, FunctionRequestAccountData>> = OnceLock::new();
    MEM.get_or_init(DashMap::new)
}

fn get_routine_accounts() -> &'static DashMap<String, FunctionRoutineAccountData> {
    static MEM: OnceLock<DashMap<String, FunctionRoutineAccountData>> = OnceLock::new();
    MEM.get_or_init(DashMap::new)
}

pub struct SwitchboardAccounts {
    pub fn_accounts: DashMap<Pubkey, FunctionAccountData>,
    pub req_accounts: DashMap<Pubkey, FunctionRequestAccountData>,
}

pub struct SolanaOracle {
    pub program: Program<Arc<Keypair>>,
}

#[derive(Debug, Clone)]
struct Task {
    pub container_name: String,
    pub parameters: Vec<String>,
}

impl Task {
    async fn execute(&self) {
        println!("Executing task: {:?}", self);
        // sleep(Duration::from_millis(250)).await;
        // println!("Finished task: {:?}", self);
    }
}

#[tokio::main(worker_threads = 12)]
async fn main() {
    println!("Hello, world!");

    solana_oracle().await;

    println!("Exiting ...");
}

async fn solana_oracle() {
    let rpc_url =
        "https://switchbo-switchbo-6225.devnet.rpcpool.com/f6fb9f02-0777-498b-b8f5-67cbb1fc0d14";
    let payer_secret_key = std::fs::read_to_string("/Users/gally/.config/solana/id.json").unwrap();
    let payer_keypair = read_keypair(&mut Cursor::new(&payer_secret_key)).unwrap();
    let client = Client::new_with_options(
        Cluster::Custom(rpc_url.to_string(), rpc_url.to_string()),
        Arc::new(payer_keypair),
        CommitmentConfig::processed(),
    );
    let program: Program<Arc<Keypair>> =
        client.program(SWITCHBOARD_ATTESTATION_PROGRAM_ID).unwrap();

    // The main thread is responsible for fetching the accounts and caching the results
    // Worker threads are spun up to process the queue and run the Switchboard functions.

    let queue: Arc<RwLock<Injector<Task>>> = Arc::new(RwLock::new(Injector::new()));

    // Spawn a producer thread
    for i in 0..10 {
        let task = Task {
            container_name: format!("container_{}", i),
            parameters: vec!["param1".to_string(), "param2".to_string()],
        };
        println!("Adding task {:?}", task);
        queue.read().await.push(task);
        // sleep(Duration::from_millis(50)).await; // Optional, just to simulate some delay
    }

    println!("Trying to execute tasks ...");

    tokio::join!(simulate_queue(queue.clone()), process_queue(queue.clone()));
}

/// Simulate adding tasks to the queue
async fn simulate_queue(queue: Arc<RwLock<Injector<Task>>>) {
    let mut retry_count = 10;

    while retry_count > 0 {
        let mut handles = vec![];

        // Spawn a producer thread
        for i in 0..10 {
            let q = queue.clone();
            handles.push(tokio::spawn(async move {
                let task = Task {
                    container_name: format!("container_{}", i),
                    parameters: vec!["param1".to_string(), "param2".to_string()],
                };
                println!("Adding task {:?}", task);
                q.read().await.push(task);
            }));
            sleep(Duration::from_millis(50)).await; // Optional, just to simulate some delay
        }

        let handle_results = join_all(handles).await;

        // Check for errors and handle them appropriately.
        for (i, result) in handle_results.iter().enumerate() {
            match result {
                Ok(_) => println!("AddTaskHandle #{} completed successfully", i),
                Err(e) => eprintln!("AddTaskHandle #{} encountered an error: {:?}", i, e),
            }
        }

        retry_count -= 1;
    }
}

/// Process the queue and remove any tasks that are ready for execution
async fn process_queue(queue: Arc<RwLock<Injector<Task>>>) {
    while !queue.read().await.is_empty() {
        println!("Found {} tasks in queue", queue.read().await.len());

        let mut handles = vec![];

        for i in 0..queue.read().await.len() {
            println!("Creating handle #{}", i);
            let q = queue.clone();
            handles.push(tokio::spawn(async move {
                let queue = q.read().await;
                match queue.steal() {
                    Steal::Success(task) => {
                        println!("Stealing task: {:?}", task);
                        task.execute().await;
                    }
                    _ => println!("No task to steal"),
                }
            }));
        }

        let handle_results = join_all(handles).await;

        // Check for errors and handle them appropriately.
        for (i, result) in handle_results.iter().enumerate() {
            match result {
                Ok(_) => println!("Handle #{} completed successfully", i),
                Err(e) => eprintln!("Handle #{} encountered an error: {:?}", i, e),
            }
        }
    }
}
