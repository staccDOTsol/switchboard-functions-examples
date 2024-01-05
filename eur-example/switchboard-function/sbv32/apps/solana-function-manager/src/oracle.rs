use crate::*;
use crate::utils::{ load_client, start_routine, start_routine_from_interval };

use kv_log_macro::{ error, debug, info, trace };

use base64::{ engine::general_purpose, Engine as _ };
use bollard::{ Docker, service::ImageSummary };
use dashmap::{ DashMap, DashSet };
use futures::{ Future, StreamExt };
use futures_util::future::join_all;
use std::{ default::Default, collections::HashMap };
use std::pin::Pin;
use tokio::{ try_join, join };
use chrono::{ NaiveDateTime, Utc };
use switchboard_common::FunctionManagerEnvironment;
use switchboard_container_utils::{
    ContainerManager,
    DockerManager,
    QvnContainer,
    handle_bollard_error,
    ContainerManagerWithBackoff,
};
use switchboard_solana::{
    solana_client::{
        nonblocking::{ pubsub_client::PubsubClient, rpc_client::RpcClient },
        rpc_config::{ RpcTransactionLogsConfig, RpcTransactionLogsFilter },
        rpc_response::RpcBlockhash,
    },
    solana_sdk::{ commitment_config::CommitmentConfig, hash::Hash },
    FunctionFilters,
    FunctionRequestFilters,
    FunctionRequestTriggerEvent,
    FunctionRoutineFilters,
};
use tokio::{ sync::{ Mutex, RwLock }, time::{ interval, Interval }, task::JoinHandle };

static DEFAULT_FETCH_INTERVAL: u64 = 5;

#[derive(Default, Clone, Debug)]
pub enum FunctionManagerStatus {
    #[default]
    Initializing,
    Ready,
}

// TODO !! We should move the oracle context to its own clone-able struct so we can move to a new thread for read-only access

// !!! This module should have the most test coverage - caching issues suck.

/// Stores the context for the oracle inside a OnceCell so it is only ever
/// initialized once but available across threads. (A OnceCell might be overkill,
/// we might be better off just passing it to each routine in an Arc).
///
/// We will store all of the active functions, routines, and requests here so we
/// can access them from anywhere in the program. This will allow us to hook into
/// our data store for extra routines like container fetcher, balance watcher, etc.
#[derive(Clone)]
pub struct SolanaFunctionManager {
    pub status: FunctionManagerStatus,

    // Context
    pub verifier: Pubkey,
    pub reward_receiver: Pubkey,
    pub attestation_queue: Pubkey,

    pub client: Arc<RwLock<Client<Arc<Keypair>>>>,
    pub rpc: Arc<RpcClient>,
    pub payer: Arc<Keypair>,
    pub payer_pubkey: Pubkey,
    pub enclave_signer: Arc<RwLock<Keypair>>,

    pub metrics: &'static SwitchboardMetrics,
    pub health: &'static SwitchboardHealth,

    // TODO: crossbeam queue

    ////////////////////////////////////////
    // On-Chain State
    ////////////////////////////////////////

    pub queue_data: Arc<RwLock<AttestationQueueAccountData>>,
    pub payer_balance: Arc<RwLock<u64>>,
    pub recent_blockhash: Arc<RwLock<Hash>>,
    pub slot: Arc<RwLock<u64>>,
    pub functions: Arc<DashMap<Pubkey, FunctionAccountData>>,

    ////////////////////////////////////////
    // Container Optimizations
    ////////////////////////////////////////
    pub docker: Arc<ContainerManagerWithBackoff>,
    // pub qvn: Arc<QvnContainer>,
}

impl SolanaFunctionManager {
    /// Initialize a new Solana oracle with a cache.
    pub async fn new() -> Result<Self, SbError> {
        // Load the payer keypair
        let env = FunctionManagerEnvironment::parse()?;
        let (client, payer, payer_pubkey, reward_receiver) = load_client(&env).unwrap();

        let rpc = Arc::new(client.program(SWITCHBOARD_ATTESTATION_PROGRAM_ID).async_rpc());

        let verifier_pubkey = Pubkey::from_str(&env.quote_key).unwrap();
        let verifier_data = VerifierAccountData::fetch_async(&rpc, verifier_pubkey).await?;

        let attestation_queue = verifier_data.attestation_queue;
        let attestation_queue_data = AttestationQueueAccountData::fetch_async(
            &rpc,
            attestation_queue
        ).await?;
        let queue_data =
            attestation_queue_data.data[0..attestation_queue_data.data_len as usize].to_vec();
        let queue_idx: u32 = queue_data
            .iter()
            .position(|pubkey| pubkey == &verifier_pubkey)
            .unwrap() as u32;

        // Start the docker daemon
        let docker_client = Docker::connect_with_local_defaults().unwrap();
        // println!("{:#?}", docker_client.info().await.unwrap());
        let docker = Arc::new(docker_client.clone());
        let container_manager = Arc::new(ContainerManagerWithBackoff::new(docker, None));

        // Delete the QVN and reload the image if needed
        let mut filters = HashMap::new();
        filters.insert("reference", vec!["qvn"]);
        let images = docker_client
            .list_images(
                Some(bollard::image::ListImagesOptions {
                    all: true,
                    filters,
                    digests: false,
                })
            ).await
            .unwrap();

        if images.is_empty() {
            let qvn_path = std::env
                ::var("SWITCHBOARD_QVN_TAR_PATH")
                .unwrap_or("/qvn.tar".to_string());
            println!("Loading QVN docker image from tar archive: {:?}", qvn_path);
            container_manager.load_image_from_archive(qvn_path.as_str(), true).await?;
        }

        // if images.len() > 0 {
        //     docker_client
        //         .remove_image(
        //             "qvn",
        //             Some(bollard::image::RemoveImageOptions {
        //                 force: true,
        //                 ..Default::default()
        //             }),
        //             None
        //         ).await
        //         .unwrap();
        // }

        // let qvn = Arc::new(QvnContainer::create(docker_client.clone(), "qvn", vec![], None).await?);

        // Fetch all function accounts and add to set
        let functions = FunctionAccountData::get_program_accounts(&rpc, FunctionFilters {
            attestation_queue: Some(attestation_queue),
            ..Default::default()
        }).await.unwrap();

        Ok(Self {
            status: FunctionManagerStatus::Initializing,

            verifier: verifier_pubkey,
            attestation_queue,
            reward_receiver,

            client: Arc::new(RwLock::new(client)),
            payer,
            payer_pubkey,
            rpc,
            enclave_signer: Arc::new(RwLock::new(Keypair::new())), // TODO: handle this properly

            metrics: SwitchboardMetrics::get_or_init(),
            health: SwitchboardHealth::get_or_init().await,

            queue_data: Arc::new(RwLock::new(attestation_queue_data)),
            payer_balance: Default::default(),
            recent_blockhash: Default::default(),
            slot: Default::default(),
            functions: Arc::new(functions.into_iter().collect()),

            docker: container_manager,
            // qvn,
        })
    }

    pub async fn initialize(&mut self) -> Result<(), SbError> {
        // 1. Start the QVN, then wait for the QVN to signal readiness or rotate its keypair
        // we will need to add logic to the QVN to respond to /ready when it is ready
        // - start_qvn
        // - fetch_docker_layers

        println!("Starting QVN and pre-fetching docker layers");

        let start_qvn_handle = try_join!(self.start_qvn()).unwrap();

        // let (start_qvn_handle, _fetch_switchboard_layers_result, _fetch_layers_result) = try_join!(
        //     self.start_qvn(),
        //     self.docker.fetch_switchboard_docker_layers(),
        //     self.fetch_docker_layers()
        // ).unwrap();

        self.status = FunctionManagerStatus::Ready;

        // start health checker to signal k8s readiness
        self.health.set_is_ready().await;

        println!("Initialization complete");

        Ok(())
    }

    /// Start the Solana oracle and watch the chain for functions to execute.
    pub async fn start(&mut self) {
        // 2. Start all of the handlers
        // - Account watcher: fetches program accounts and uses cache to run any ready containers
        // - Event watcher: watches for request trigger events to add to the crossbeam queue
        // - Container watcher: uses the crossbeam queue to run any ready containers
        //       - we need a way to invalidate container runs before they are executed. for example
        //         if we saw a request was ready but another oracle stole execution or we already ran it
        //         and we're awaiting confirmation.

        println!("Starting routines ...");

        // TODO: these should all be started in a single OS thread
        tokio::select! {
            _ = self.fetch_docker_layers_routine(None)=> {
                panic!("fetch_docker_layers returned unexpectedly");
            }
            _ = self.watch_blockhash_and_slot(None) => {
                panic!("watch_blockhash_and_slot returned unexpectedly");
            }
            _ = self.watch_attestation_queue(None) => {
                panic!("watch_attestation_queue returned unexpectedly");
            }
            _ = self.watch_payer_balance(None)=> {
                panic!("watch_payer_balance returned unexpectedly");
            }
            _ = self.watch_function_accounts(None) => {
                panic!("watch_function_accounts returned unexpectedly");
            }
            _ = self.watch_routine_accounts(None) => {
                panic!("watch_routine_accounts returned unexpectedly");
            }
            _ = self.watch_request_accounts(None) => {
                panic!("watch_request_accounts returned unexpectedly");
            }
            _ = self.watch_request_trigger_events() => {
                panic!("watch_request_trigger_events returned unexpectedly");
            }
        }

        // TODO: start worker threads in a new OS thread to watch for containers to execute

        panic!("Solana oracle crashed");
    }

    /// Starts the quote verification container and awaits for it to signal readiness
    async fn start_qvn(&self) -> Result<JoinHandle<()>, SbError> {
        // let handle = self.qvn.clone().watch().await?;
        // Ok(handle)

        let handle = tokio::spawn(async {});
        Ok(handle)
    }

    /// Iterates over the set of docker image names and caches them in the oracle for faster retrieval.
    // TODO: we should blacklist containers here if we can not fetch them - but we should always attempt to fetch inside this routine.
    async fn fetch_docker_layers_routine(&self, routine_interval: Option<u64>) {
        // Start an interval and skip the first tick, we already fetched the docker layers during initialization
        let mut interval: Interval = interval(
            Duration::from_secs(std::cmp::max(30, routine_interval.unwrap_or(300)))
        );
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        interval.tick().await;

        start_routine_from_interval(interval, move || async move {
            self.fetch_docker_layers().await
        }).await;
    }

    async fn fetch_docker_layers(&self) -> Result<(), SbError> {
        let image_names: Vec<String> = self.functions
            .clone()
            .iter()
            .map(|function| function.get_name())
            .collect();

        println!("Fetching {} docker images", image_names.len());

        self.docker.fetch_images(image_names).await
    }

    /// Periodically fetch the Solana time from on-chain so we know when to execute functions.
    async fn watch_blockhash_and_slot(&self, routine_interval: Option<u64>) {
        start_routine(std::cmp::max(1, routine_interval.unwrap_or(DEFAULT_FETCH_INTERVAL)), || {
            Box::pin(async {
                let blockhash_result = tokio::join!(
                    self.rpc.get_latest_blockhash_with_commitment(CommitmentConfig::processed())
                );

                if let Ok((blockhash, slot)) = blockhash_result.0 {
                    let mut recent_blockhash = self.recent_blockhash.write().await;
                    *recent_blockhash = blockhash;

                    let mut last_valid_block_height: tokio::sync::RwLockWriteGuard<
                        '_,
                        u64
                    > = self.slot.write().await;
                    *last_valid_block_height = slot;
                }

                Ok(())
            })
        }).await;
    }

    async fn fetch_blockhash_and_slot(&self) {
        let blockhash_result = tokio::join!(
            self.rpc.get_latest_blockhash_with_commitment(CommitmentConfig::processed())
        );

        if let Ok((blockhash, slot)) = blockhash_result.0 {
            let mut recent_blockhash = self.recent_blockhash.write().await;
            *recent_blockhash = blockhash;

            let mut last_valid_block_height: tokio::sync::RwLockWriteGuard<
                '_,
                u64
            > = self.slot.write().await;
            *last_valid_block_height = slot;
        }
    }

    /// Periodically fetch the Attestation Queue account to re-verify the queue_idx position.
    // TODO: we may need to fetch this more often so we have the curr_idx field defined for secondary assignment
    async fn watch_attestation_queue(&self, routine_interval: Option<u64>) {
        start_routine(std::cmp::max(1, routine_interval.unwrap_or(5)), || {
            Box::pin(async {
                self.fetch_attestation_queue().await;

                Ok(())
            })
        }).await;
    }

    async fn fetch_attestation_queue(&self) {
        match AttestationQueueAccountData::fetch_async(&self.rpc, self.attestation_queue).await {
            Ok(attestation_queue_data) => {
                //
                let mut queue_data = self.queue_data.write().await;
                *queue_data = attestation_queue_data;
            }
            Err(e) => {
                error!("Failed to fetch AttestationQueue: {:?}", e);
            }
        }
    }

    /// Periodically fetch the Solana time from on-chain so we know when to execute functions.
    async fn watch_payer_balance(&self, routine_interval: Option<u64>) {
        start_routine(std::cmp::max(5, routine_interval.unwrap_or(30)), || {
            Box::pin(async {
                self.fetch_payer_balance().await;

                Ok(())
            })
        }).await;
    }

    async fn fetch_payer_balance(&self) {
        match self.rpc.get_balance(&self.payer_pubkey).await {
            Ok(balance) => {
                let payer_balance_decimal = SwitchboardDecimal {
                    mantissa: balance.try_into().unwrap(),
                    scale: 9,
                };
                let payer_decimal_float: f64 = payer_balance_decimal.try_into().unwrap();
                println!("PAYER_BALANCE: {:?} SOL", payer_decimal_float);

                if balance <= 10000 {
                    panic!(
                        "Payer ({}) balance is low on funds {:?}",
                        self.payer_pubkey,
                        payer_decimal_float
                    );
                }

                let mut payer_balance = self.payer_balance.write().await;
                *payer_balance = balance;
            }
            Err(e) => error!("Failed to fetch payer balance: {:?}", e),
        }
    }

    async fn fetch_multiple_accounts(&self) {
        let pubkeys = vec![self.payer_pubkey, self.attestation_queue];
        let accounts = self.rpc.get_multiple_accounts(&pubkeys).await;

        match self.rpc.get_multiple_accounts(&pubkeys).await {
            Ok(accounts) => {
                // Set payer balance
                match accounts.get(0) {
                    Some(Some(payer_account)) => {
                        let balance = payer_account.lamports;

                        let payer_balance_decimal = SwitchboardDecimal {
                            mantissa: balance.try_into().unwrap(),
                            scale: 9,
                        };
                        let payer_decimal_float: f64 = payer_balance_decimal.try_into().unwrap();
                        println!("PAYER_BALANCE: {:?} SOL", payer_decimal_float);

                        if balance <= 10000 {
                            panic!(
                                "Payer ({}) balance is low on funds {:?}",
                                self.payer_pubkey,
                                payer_decimal_float
                            );
                        }

                        let mut payer_balance = self.payer_balance.write().await;
                        *payer_balance = balance;
                    }
                    _ => error!("Failed to fetch payer account info"),
                }

                // Set AttestationQueue data
                match accounts.get(1) {
                    Some(Some(attestation_queue_account)) => {
                        match
                            AttestationQueueAccountData::try_deserialize(
                                &mut &attestation_queue_account.data[..]
                            )
                        {
                            Ok(attestation_queue_data) => {
                                let mut queue_data = self.queue_data.write().await;
                                *queue_data = attestation_queue_data;
                            }
                            Err(err) => {
                                error!("Failed: {:#?}", err);
                            }
                        }
                    }
                    _ => error!("Failed to fetch attestation_queue account info"),
                }
            }
            Err(err) => error!("Failed to fetch switchboard accounts"),
        }
    }

    /// Periodically fetch all of the function accounts on the given queue
    async fn watch_function_accounts(&self, routine_interval: Option<u64>) {
        start_routine(std::cmp::max(1, routine_interval.unwrap_or(DEFAULT_FETCH_INTERVAL)), || {
            Box::pin(async {
                let functions = FunctionAccountData::get_program_accounts(
                    &self.rpc,
                    FunctionFilters {
                        attestation_queue: Some(self.attestation_queue),
                        ..Default::default()
                    }
                ).await?;

                println!("Found {} function accounts", functions.len());

                let queue_data = self.queue_data.read().await;

                // Iterate over the newly fetched data, cache may have closed accounts present
                functions
                    .iter()
                    .for_each(|(function_pubkey, function_data)|
                        self.handle_function_account(function_pubkey, function_data, &queue_data)
                    );

                Ok(())
            })
        }).await;
    }

    fn handle_function_account(
        &self,
        function_pubkey: &Pubkey,
        function_data: &FunctionAccountData,
        queue_data: &AttestationQueueAccountData
    ) {
        let now = Utc::now();

        // Add to cache
        self.functions.insert(*function_pubkey, *function_data);
        let image_name = function_data.get_name();

        if
            self.docker
                .is_function_ready(function_pubkey.to_string().as_str(), image_name.as_str())
                .is_err()
        {
            return;
        }

        let is_primary = queue_data.data[function_data.queue_idx as usize] == self.verifier;
        let is_secondary = queue_data.data[queue_data.curr_idx as usize] == self.verifier;

        let should_execute = function_data.should_execute(now);

        let primary_should_execute = is_primary && should_execute;
        let mut secondary_should_steal_execution = false;

        if is_secondary && should_execute {
            if let Some(next_execution) = function_data.get_next_execution_datetime() {
                if (now - next_execution).num_seconds() > 30 {
                    secondary_should_steal_execution = true;
                }
            }
        }

        if !primary_should_execute && !secondary_should_steal_execution {
            return;
        }

        // TODO: create container and add to map

        // if primary_should_execute {
        //     println!("Container is READY: {:?}", image_name);
        // }
    }

    /// Periodically fetch all routine accounts on the given queue
    async fn watch_routine_accounts(&self, routine_interval: Option<u64>) {
        start_routine(std::cmp::max(1, routine_interval.unwrap_or(DEFAULT_FETCH_INTERVAL)), || {
            Box::pin(async {
                let routines = FunctionRoutineAccountData::get_program_accounts(
                    &self.rpc,
                    FunctionRoutineFilters {
                        attestation_queue: Some(self.attestation_queue),
                        ..Default::default()
                    }
                ).await?;

                println!("Found {} routine accounts", routines.len());

                let queue_data = self.queue_data.read().await;

                // Iterate over the newly fetched data, cache may have closed accounts present
                routines
                    .iter()
                    .for_each(|(routine_pubkey, routine_data)|
                        self.handle_routine_account(routine_pubkey, routine_data, &queue_data)
                    );

                Ok(())
            })
        }).await;
    }

    fn handle_routine_account(
        &self,
        routine_pubkey: &Pubkey,
        routine_data: &FunctionRoutineAccountData,
        queue_data: &AttestationQueueAccountData
    ) {
        let now = Utc::now();

        let function_data = match self.functions.get(&routine_data.function) {
            Some(function_data) => *function_data,
            None => {
                error!(
                    "Failed to find function ({:?}) for routine ({:?})",
                    routine_data.function,
                    routine_pubkey
                );
                return;
            }
        };

        let image_name = function_data.get_name();

        if
            self.docker
                .is_function_ready(routine_pubkey.to_string().as_str(), image_name.as_str())
                .is_err()
        {
            return;
        }

        let is_primary = queue_data.data[routine_data.queue_idx as usize] == self.verifier;
        let is_secondary = queue_data.data[queue_data.curr_idx as usize] == self.verifier;

        let should_execute = routine_data.should_execute(now);
        let primary_should_execute = should_execute && is_primary;

        let mut secondary_should_steal_execution = false;
        if is_secondary && should_execute {
            if let Some(next_execution) = routine_data.get_next_execution_datetime() {
                if (now - next_execution).num_seconds() > 30 {
                    secondary_should_steal_execution = true;
                }
            }
        }

        if !primary_should_execute && !secondary_should_steal_execution {
            return;
        }

        // TODO: create container

        // if primary_should_execute {
        //     println!("Container is READY: {:?}", image_name);
        // }
    }

    /// Periodically fetch all request accounts on the given queue
    async fn watch_request_accounts(&self, routine_interval: Option<u64>) {
        start_routine(std::cmp::max(1, routine_interval.unwrap_or(DEFAULT_FETCH_INTERVAL)), || {
            Box::pin(async {
                let requests = FunctionRequestAccountData::get_program_accounts(
                    &self.rpc,
                    FunctionRequestFilters {
                        attestation_queue: Some(self.attestation_queue),
                        is_active: Some(true),
                        is_triggered: Some(true),
                        ..Default::default()
                    }
                ).await?;

                println!("Found {} request accounts", requests.len());

                let queue_data = self.queue_data.read().await;
                let slot = *self.slot.read().await;

                // Iterate over the newly fetched data, cache may have closed accounts present
                requests
                    .iter()
                    .for_each(|(request_pubkey, request_data)|
                        self.handle_request_account(request_pubkey, request_data, &queue_data, slot)
                    );

                Ok(())
            })
        }).await;
    }

    fn handle_request_account(
        &self,
        request_pubkey: &Pubkey,
        request_data: &FunctionRequestAccountData,
        queue_data: &AttestationQueueAccountData,
        slot: u64
    ) {
        let now = Utc::now();

        let function_data = match self.functions.get(&request_data.function) {
            Some(function_data) => *function_data,
            None => {
                error!(
                    "Failed to find function ({:?}) for request ({:?})",
                    request_data.function,
                    request_pubkey
                );
                return;
            }
        };

        let image_name = function_data.get_name();

        if
            self.docker
                .is_function_ready(request_pubkey.to_string().as_str(), image_name.as_str())
                .is_err()
        {
            return;
        }

        let ready_slot = request_data.active_request.valid_after_slot;
        let fallback_slot = ready_slot + 75;

        let is_primary =
            queue_data.data[request_data.active_request.queue_idx as usize] == self.verifier;
        let is_secondary = queue_data.data[queue_data.curr_idx as usize] == self.verifier;

        let primary_should_execute = is_primary && slot >= ready_slot;
        let secondary_should_steal_execution = is_secondary && slot >= fallback_slot;

        if !primary_should_execute && !secondary_should_steal_execution {
            return;
        }

        // TODO: handle container creation

        if primary_should_execute {
            println!("Request is READY: {:?}", image_name);
        }
    }

    /// Stream websocket events for the request trigger event
    async fn watch_request_trigger_events(&self) {
        let ws_url = self.rpc.url().replace("http://", "ws://").replace("https://", "wss://");
        let pubsub_client = PubsubClient::new(ws_url.as_str()).await.unwrap();
        loop {
            let (mut r, _handler) = pubsub_client
                .logs_subscribe(
                    RpcTransactionLogsFilter::Mentions(
                        vec![SWITCHBOARD_ATTESTATION_PROGRAM_ID.to_string()]
                    ),
                    RpcTransactionLogsConfig {
                        commitment: Some(CommitmentConfig::processed()),
                    }
                ).await
                .unwrap();
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
                    if decoded[..8] != FunctionRequestTriggerEvent::DISCRIMINATOR {
                        continue;
                    }

                    if let Ok(event) = FunctionRequestTriggerEvent::try_from_slice(&decoded[8..]) {
                        self.handle_request_trigger_event(event).await;
                    }
                }
            }
        }
    }

    async fn handle_request_trigger_event(&self, event: FunctionRequestTriggerEvent) {
        // TODO: check the cache and see if this is a newly emitted event
        println!("[EVENT] {:#?}", event);
    }
}
