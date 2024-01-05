use crate::*;

use crate::sdk;
use crate::ContainerRunnerCtx;
use crate::SolanaContainerJob;
use async_channel::Sender;
use chrono::{NaiveDateTime, Utc};
use dashmap::DashMap;
use hex;
use solana_client::nonblocking::rpc_client::RpcClient;
use solana_sdk::commitment_config::CommitmentLevel;
use solana_sdk::{pubkey::Pubkey, signature::Keypair};
use std::result::Result;
use std::str::FromStr;
use std::{sync::Arc, time::Duration};
pub use switchboard_solana::prelude::{AccountDeserialize, AccountSerialize};
use switchboard_solana::{FunctionFilters, FunctionRequestFilters, FunctionRoutineFilters};
use sys_info;
use tokio::sync::mpsc::UnboundedSender;
use tokio::time::{interval, Interval, MissedTickBehavior};

#[event]
#[derive(Debug, Clone)]
pub struct FunctionRequestTriggerEvent {
    pub attestation_queue: Pubkey,
    pub attestation_queue_authority: Pubkey,
    pub verifier: Pubkey,
    pub request: Pubkey,
    pub function: Pubkey,
    pub container_registry: Vec<u8>,
    pub container: Vec<u8>,
    pub bounty: u64,
    pub request_slot: u64,
    pub expiration_slot: u64,
    pub container_params: Option<Vec<u8>>,
    pub container_params_hash: Vec<u8>,
    pub is_init: bool,
}

pub fn build_req_from_template(event: FunctionRequestTriggerEvent) -> FunctionRequestAccountData {
    let mut temp = FunctionRequestAccountData::default();
    temp.attestation_queue = event.attestation_queue;
    temp.function = event.function;
    if event.container_params.is_some() {
        temp.container_params = event.container_params.unwrap();
    }
    temp.active_request.verifier = event.verifier;
    temp
}

// TODO: do lock upgrade here instead
pub async fn register_and_send(
    runner_channel: Arc<Sender<ContainerRunnerCtx>>,
    processing_keys: Arc<RwLock<HashSet<String>>>,
    ctx: ContainerRunnerCtx,
) {
    processing_keys.write().await.insert(ctx.running_key());
    runner_channel.send(ctx).await.unwrap();
}

pub struct SwitchboardFunctionAccounts {
    // All of the functions on the given queue
    pub functions: Arc<DashMap<Pubkey, FunctionAccountData>>,
    /// The assigned functions for the given oracle's queue_idx
    // NOTE: This will be deprecated after function routine execution moves to routines.
    pub active_functions: Arc<Vec<(Pubkey, FunctionAccountData)>>,
    /// The assigned routines for the given oracle's queue_idx
    pub active_routines: Arc<Vec<(Pubkey, FunctionRoutineAccountData)>>,
    /// The assigned requests for the given oracle's queue_idx
    pub active_requests: Arc<Vec<(Pubkey, FunctionRequestAccountData)>>,
}

impl SwitchboardFunctionAccounts {
    /// Fetches the SwitchboardFunctionAccounts for the given queue.
    ///
    /// # Arguments
    ///
    /// * `program` - The anchor_client program.
    /// * `queue_pubkey` - The queue's public key.
    /// * `verifier_queue_idx` - The verifier's queue index.
    /// * `slot` - The current slot.
    ///
    /// # Returns
    ///
    /// The SwitchboardFunctionAccounts for the given queue.
    pub async fn fetch(
        rpc: Arc<RpcClient>,
        attestation_queue: Pubkey,
        verifier_queue_idx: u32,
        slot: u64,
    ) -> Self {
        // Here we can handle some better caching logic - we dont need to fetch functions every time anymore
        // functions should be fetched once and then cached

        // Fetch all of the functions for the queue, we will need to map these to their requests/routines
        // We may want to check permissions here to make sure the oracle is allowed to execute the function

        let (functions, active_routines, active_requests) = tokio::join!(
            SwitchboardFunctionAccounts::load_functions(
                rpc.clone(),
                attestation_queue,
                verifier_queue_idx,
            ),
            SwitchboardFunctionAccounts::load_routines(
                rpc.clone(),
                attestation_queue,
                verifier_queue_idx,
            ),
            SwitchboardFunctionAccounts::load_requests(
                rpc.clone(),
                attestation_queue,
                verifier_queue_idx,
                slot,
            )
        );

        let mut active_functions: Vec<(Pubkey, FunctionAccountData)> = Vec::new();
        for (fn_key, function) in functions.clone() {
            if !function.is_empty_schedule()
                && (function.status == FunctionStatus::Active
                    || function.status == FunctionStatus::None)
            {
                active_functions.push((fn_key, function));
            }
        }

        info!("Found {} functions", functions.len(), {id: "rpc"});
        info!("Found {} active functions", active_functions.len(), {id: "rpc"});
        info!("Found {} active routines", active_routines.len(), {id: "rpc"});
        info!("Found {} active requests", active_requests.len(), {id: "rpc"});

        Self {
            functions: Arc::new(functions.into_iter().collect()),
            active_functions: Arc::new(active_functions),
            active_routines: Arc::new(active_routines),
            active_requests: Arc::new(active_requests),
        }
    }

    async fn load_functions(
        rpc: Arc<RpcClient>,
        attestation_queue: Pubkey,
        _verifier_queue_idx: u32,
    ) -> Vec<(Pubkey, FunctionAccountData)> {
        FunctionAccountData::get_program_accounts(
            rpc.as_ref(),
            FunctionFilters {
                attestation_queue: Some(attestation_queue),
                ..Default::default()
            },
            Some(CommitmentLevel::Processed),
        )
        .await
        .unwrap_or_default()
    }

    /// Fetch FunctionRoutines for the queue
    async fn load_routines(
        rpc: Arc<RpcClient>,
        attestation_queue: Pubkey,
        verifier_queue_idx: u32,
    ) -> Vec<(Pubkey, FunctionRoutineAccountData)> {
        FunctionRoutineAccountData::get_program_accounts(
            rpc.as_ref(),
            FunctionRoutineFilters {
                attestation_queue: Some(attestation_queue),
                queue_idx: Some(verifier_queue_idx),
                ..Default::default()
            },
            Some(CommitmentLevel::Processed),
        )
        .await
        .unwrap_or_default()
    }

    /// Fetch FunctionRequests for the queue that are triggered and pending
    async fn load_requests(
        rpc: Arc<RpcClient>,
        attestation_queue: Pubkey,
        verifier_queue_idx: u32,
        _slot: u64,
    ) -> Vec<(Pubkey, FunctionRequestAccountData)> {
        FunctionRequestAccountData::get_program_accounts(
            rpc.as_ref(),
            FunctionRequestFilters {
                attestation_queue: Some(attestation_queue),
                is_triggered: Some(true),
                is_active: Some(true),
                queue_idx: Some(verifier_queue_idx),
                ..Default::default()
            },
            Some(CommitmentLevel::Processed),
        )
        .await
        .unwrap_or_default()

        // let mut function_requests: DashMap<Pubkey, FunctionRequestAccountData> = DashMap::new();
        // for (fn_request_key, function_request) in functions_requests_vec {
        //     if (function_request.active_request.valid_after_slot == 0
        //         || slot >= function_request.active_request.valid_after_slot)
        //     {
        //         function_requests.insert(fn_request_key, function_request);
        //     }
        // }

        // function_requests
    }
}

pub async fn on_request_trigger_event(
    verifier: Pubkey,
    event: FunctionRequestTriggerEvent,
    async_rpc: Arc<RpcClient>,
    runner_channel: Arc<Sender<ContainerRunnerCtx>>,
    processing_keys: Arc<RwLock<HashSet<String>>>,
) {
    if verifier != event.verifier {
        return;
    }
    let (function_data_result, verifier_data_result) = join!(
        FunctionAccountData::fetch_async(&async_rpc, event.function),
        // FunctionRequestAccountData::fetch_async(&async_rpc, event.request),
        VerifierAccountData::fetch_async(&async_rpc, verifier)
    );
    if function_data_result.is_err() {
        // println!("REQUEST WS ERR 1 {} {:?}", event.function, function_data_result);
        return;
    }
    let function_data = function_data_result.unwrap();
    if verifier_data_result.is_err() {
        println!("REQUEST WS ERR 3 {} {:?}", verifier, verifier_data_result);
        return;
    }
    let verifier_signer = verifier_data_result.unwrap().enclave.enclave_signer;

    // TODO: this wasnt created yet. must make a dummy one
    // if function_request_data_result.is_err() {
    // println!("REQUEST WS ERR 2 {} {:?}", event.request, function_request_data_result);
    // return;
    // }
    let function_request_data = build_req_from_template(event.clone());
    // let verifier_signer = if verifier_data_result.is_err() {
    // Pubkey::default()
    // } else {
    // verifier_data_result.unwrap().enclave.enclave_signer
    // };
    let name = function_data.get_name();
    let runner_ctx = ContainerRunnerCtx {
        name,
        slot: event.request_slot,
        verifier_signer: verifier_signer.to_string(),
        queue_authority: event.attestation_queue_authority.to_string(),
        fn_key: event.function.to_string(),
        encoded_fn: hex::encode(bytemuck::bytes_of(&function_data)),
        job: SolanaContainerJob::Request(SolanaJob {
            name: event.request.to_string(),
            pubkey: event.request.to_string(),
            encoded_account: hex::encode(function_request_data.try_to_vec().unwrap()),
        }),
    };
    println!("Sending WS REQUEST");
    register_and_send(runner_channel.clone(), processing_keys, runner_ctx).await;
}

pub async fn function_check_routine(
    processing_keys: Arc<RwLock<HashSet<String>>>,
    backoff_map: Arc<RwLock<HashMap<String, (SystemTime, Duration)>>>,
    last_ex_map: Arc<RwLock<HashMap<String, u64>>>,
    client: anchor_client::Client<Arc<Keypair>>,
    qvn: Arc<Qvn>,
    runner_channel: Sender<ContainerRunnerCtx>,
    dl_channel: UnboundedSender<String>,
) {
    let program: Arc<anchor_client::Program<Arc<Keypair>>> =
        Arc::new(client.program(SWITCHBOARD_ATTESTATION_PROGRAM_ID).unwrap());

    let mut interval: Interval = interval(Duration::from_secs(1));
    interval.set_missed_tick_behavior(MissedTickBehavior::Delay);

    let verifier = &Env::get().QUOTE_KEY;
    let verifier_pubkey = Pubkey::from_str(verifier).unwrap();
    println!("{}", Env::get());
    let async_rpc = Arc::new(program.async_rpc());
    let verifier_data: VerifierAccountData =
        VerifierAccountData::fetch_async(&async_rpc, verifier_pubkey)
            .await
            .unwrap();
    let queue_pubkey = verifier_data.attestation_queue;
    let wss_url = Env::get().WSS_URL.clone();
    let mprocessing_keys = processing_keys.clone();
    let mrunner_channel = Arc::new(runner_channel.clone());
    let masync_rpc = Arc::new(program.async_rpc());
    let _request_watch_handle = tokio::spawn(async move {
        clone!(mprocessing_keys, mrunner_channel, masync_rpc);
        sdk::subscribe::<FunctionRequestTriggerEvent, _, _>(
            SWITCHBOARD_ATTESTATION_PROGRAM_ID,
            wss_url.as_str(),
            move |event| {
                println!("FN REQUEST RECEIVED");
                clone!(mprocessing_keys, mrunner_channel, masync_rpc);
                on_request_trigger_event(
                    verifier_pubkey,
                    event,
                    masync_rpc,
                    mrunner_channel,
                    mprocessing_keys,
                )
            },
        )
        .await;
    });

    loop {
        interval.tick().await; // This waits for the next tick (every 1 second)
        println!("---Check-loop---");
        let qvn_ready: bool = *qvn.is_ready.read().await;
        if !qvn_ready {
            println!("Waiting for qvn to boot..");
            interval.tick().await;
            continue;
        }

        clone!(
            processing_keys,
            backoff_map,
            last_ex_map,
            program,
            runner_channel,
            dl_channel
        );
        function_checker(
            processing_keys,
            backoff_map,
            last_ex_map,
            program,
            queue_pubkey,
            verifier_pubkey,
            runner_channel,
            dl_channel,
        )
        .await;
    }
    _request_watch_handle.await.unwrap();
}

async fn function_checker(
    processing_keys: Arc<RwLock<HashSet<String>>>,
    backoff_map: Arc<RwLock<HashMap<String, (SystemTime, Duration)>>>,
    last_ex_map: Arc<RwLock<HashMap<String, u64>>>,
    program: Arc<anchor_client::Program<Arc<Keypair>>>,
    queue_pubkey: Pubkey,
    verifier_pubkey: Pubkey,
    runner_channel: Sender<ContainerRunnerCtx>,
    dl_channel: UnboundedSender<String>,
) {
    let start = Utc::now().timestamp();
    let _available_mem = sys_info::mem_info().unwrap().avail / 1024;
    let _cpu_load = sys_info::loadavg().unwrap().one;
    let _num_cpu = sys_info::cpu_num().unwrap();

    // println!(
    // "MEM: {}, CPU: {}, NUM_CPU: {}",
    // available_mem, cpu_load, num_cpu
    // );

    // Clone the async_rpc for the join future
    let async_rpc = program.async_rpc();

    let (slot_result, queue_data_result, verifier_data_result) = join!(
        async_rpc.get_slot(),
        AttestationQueueAccountData::fetch_async(&async_rpc, queue_pubkey),
        VerifierAccountData::fetch_async(&async_rpc, verifier_pubkey)
    );

    let queue_data = queue_data_result.unwrap();
    let queue_idx: u32 = queue_data
        .data
        .iter()
        .position(|&pubkey| pubkey == verifier_pubkey)
        .unwrap() as u32;

    let verifier_data = verifier_data_result.unwrap();
    let slot = slot_result.unwrap_or(u64::MAX - 1000);

    let switchboard_accounts =
        SwitchboardFunctionAccounts::fetch(Arc::new(async_rpc), queue_pubkey, queue_idx, slot)
            .await;

    // Process Active Functions
    let mut num_functions_processed = 0;
    for (fn_key, function) in switchboard_accounts.active_functions.iter() {
        if is_in_process_or_backoff(
            processing_keys.clone(),
            backoff_map.clone(),
            fn_key.to_string(),
        )
        .await
        {
            info!("function being skipped: {:?}", fn_key);
            continue;
        }
        dl_channel.send(function.get_name()).unwrap();
        match process_function(
            processing_keys.clone(),
            slot,
            fn_key,
            *function,
            &queue_data,
            &verifier_pubkey,
            &verifier_data.enclave.enclave_signer,
            &runner_channel,
        )
        .await
        {
            Ok(_function_pubkey) => {
                num_functions_processed += 1;
            }
            Err(e) => match &e {
                SbError::CustomMessage(message) => {
                    if message != "FunctionNotReady" {
                        info!("Error processing function: {:?}", e, {id: "main"});
                    }
                }
                _ => info!("Error processing function: {:?}", e, {id: "main"}),
            },
        }
    }
    debug!(
        "Processed {} / {} functions",
        num_functions_processed,
        switchboard_accounts.active_functions.len(),
        {id: "main"}
    );

    // Process Function Routines
    let mut num_routines_processed = 0;
    for (fn_routine_key, routine_data) in switchboard_accounts.active_routines.iter() {
        if let Some(function) = switchboard_accounts.functions.get(&routine_data.function) {
            if is_in_process_or_backoff(
                processing_keys.clone(),
                backoff_map.clone(),
                fn_routine_key.to_string(),
            )
            .await
            {
                continue;
            }
            println!("Porcessing from request routine: {}", fn_routine_key);
            dl_channel.send(function.get_name()).unwrap();
            match process_routine(
                processing_keys.clone(),
                slot,
                &routine_data.function,
                *function,
                fn_routine_key,
                routine_data,
                &queue_data,
                &verifier_pubkey,
                &verifier_data.enclave.enclave_signer,
                &runner_channel,
            )
            .await
            {
                Ok(_routine_pubkey) => {
                    num_routines_processed += 1;
                }
                Err(e) => match &e {
                    SbError::CustomMessage(message) => {
                        if message != "RoutineNotReady" {
                            error!("Error processing routine: {:?}", e, {id: "main"})
                        }
                    }
                    _ => error!("Error processing routine: {:?}", e, {id: "main"}),
                },
            }
        }
    }
    debug!(
        "Processed {} / {} routines",
        num_routines_processed,
        switchboard_accounts.active_routines.len(),
        {id: "main"}
    );

    // Process Function Requests
    let mut num_requests_processed = 0;
    for (fn_request_key, request_data) in switchboard_accounts.active_requests.iter() {
        // println!("Processing req {}", fn_request_key);
        if let Some(function) = switchboard_accounts.functions.get(&request_data.function) {
            if is_in_process_or_backoff(
                processing_keys.clone(),
                backoff_map.clone(),
                fn_request_key.to_string(),
            )
            .await
            {
                // println!("req is in process or backoff {}", fn_request_key);
                continue;
            }
            // dl_channel.send(function.get_name()).unwrap();
            match process_request(
                processing_keys.clone(),
                slot,
                &request_data.function,
                *function,
                fn_request_key,
                request_data,
                &queue_data,
                &verifier_pubkey,
                &verifier_data.enclave.enclave_signer,
                &runner_channel,
            )
            .await
            {
                Ok(_request_pubkey) => {
                    num_requests_processed += 1;
                }
                Err(e) => match &e {
                    SbError::CustomMessage(message) => {
                        if message != "RequestNotReady" {
                            info!("Error processing request: {:?}", e, {id: "main"})
                        }
                    }
                    _ => info!("Error processing request: {:?}", e, {id: "main"}),
                },
            }
        } else {
            println!("Error: Function not found for {}", fn_request_key);
        }
    }
    debug!(
        "Processed {} / {} requests",
        num_requests_processed,
        switchboard_accounts.active_requests.len(),
        {id: "main"}
    );

    let latency = Utc::now().timestamp() - start;
    // Track max download routine latency in this report period
    set_max(&label!(ORACLE_POLLER_LATENCY, []), latency as f64);
}

async fn process_function<'a>(
    processing_keys: Arc<RwLock<HashSet<String>>>,
    slot: u64,
    fn_key: &'a Pubkey,
    function: FunctionAccountData,
    queue_data: &AttestationQueueAccountData,
    verifier_pubkey: &Pubkey,
    verifier_enclave_signer: &Pubkey,
    runner_channel: &Sender<ContainerRunnerCtx>,
) -> Result<&'a Pubkey, SbError> {
    let now = Utc::now();
    let half_minute = chrono::Duration::from_std(Duration::from_secs(30)).unwrap();

    let name = function.get_name();
    // println!("{}", name);

    let is_primary = queue_data.data[function.queue_idx as usize] == *verifier_pubkey;
    let is_secondary = queue_data.data[queue_data.curr_idx as usize] == *verifier_pubkey;

    let primary_should_execute = is_primary && function.should_execute(now);
    let mut secondary_should_steal_execution = false;
    let triggered_since = NaiveDateTime::from_timestamp_opt(function.triggered_since, 0)
        .unwrap()
        .and_utc();
    let trigger_staleness = now - triggered_since;

    if is_secondary && function.should_execute(now) {
        if let Some(next_execution) = function.get_next_execution_datetime() {
            if now - next_execution > half_minute {
                secondary_should_steal_execution = true;
            }
        }

        if function.is_triggered == 1 && trigger_staleness > half_minute {
            secondary_should_steal_execution = true;
        }
    }

    if !primary_should_execute && !secondary_should_steal_execution {
        return Err(SbError::CustomMessage("FunctionNotReady".to_string()));
    }

    let runner_ctx = ContainerRunnerCtx {
        name,
        slot,
        verifier_signer: verifier_enclave_signer.to_string(),
        queue_authority: queue_data.authority.to_string(),

        fn_key: fn_key.to_string(),
        encoded_fn: hex::encode(bytemuck::bytes_of(&function)),

        job: SolanaContainerJob::Function,
    };
    register_and_send(runner_channel.clone().into(), processing_keys, runner_ctx).await;

    Ok(fn_key)
}

/// Processes a function routine by checking if it should be executed by the primary or secondary verifier,
/// and sends a container runner context to the runner channel if it should be executed.
///
/// # Arguments
///
/// * `slot` - The current Solana slot.
/// * `fn_key` - The public key of the function account.
/// * `function` - The data of the function account.
/// * `fn_routine_key` - The public key of the function routine account.
/// * `function_routine` - The data of the function routine account.
/// * `queue_data` - The data of the attestation queue account.
/// * `verifier_pubkey` - The public key of the verifier.
/// * `verifier_enclave_signer` - The public key of the verifier's enclave signer.
/// * `runner_channel` - The channel to send the container runner context to.
///
/// # Errors
///
/// Returns a `SbError` if the routine is not ready to execute.
///
/// # Returns
///
/// Returns the public key of the function routine account.
async fn process_routine<'a>(
    processing_keys: Arc<RwLock<HashSet<String>>>,
    slot: u64,
    fn_key: &Pubkey,
    function: FunctionAccountData,
    fn_routine_key: &'a Pubkey,
    function_routine: &FunctionRoutineAccountData,
    queue_data: &AttestationQueueAccountData,
    verifier_pubkey: &Pubkey,
    verifier_enclave_signer: &Pubkey,
    runner_channel: &Sender<ContainerRunnerCtx>,
) -> Result<&'a Pubkey, SbError> {
    let now = Utc::now();
    let half_minute = chrono::Duration::from_std(Duration::from_secs(30)).unwrap();

    let name = function.get_name();

    let is_primary = queue_data.data[function_routine.queue_idx as usize] == *verifier_pubkey;
    let is_secondary = queue_data.data[queue_data.curr_idx as usize] == *verifier_pubkey;

    let primary_should_execute = is_primary && function_routine.should_execute(now);
    let mut secondary_should_steal_execution = false;

    if is_secondary && function_routine.should_execute(now) {
        if let Some(next_execution) = function_routine.get_next_execution_datetime() {
            if now - next_execution > half_minute {
                secondary_should_steal_execution = true;
            }
        }
    }

    if !primary_should_execute && !secondary_should_steal_execution {
        return Err(SbError::CustomMessage("RoutineNotReady".to_string()));
    }

    let runner_ctx = ContainerRunnerCtx {
        name,
        slot,
        verifier_signer: verifier_enclave_signer.to_string(),
        queue_authority: queue_data.authority.to_string(),
        fn_key: fn_key.to_string(),
        encoded_fn: hex::encode(bytemuck::bytes_of(&function)),
        job: SolanaContainerJob::Routine(SolanaJob {
            name: function_routine.get_name(),
            pubkey: fn_routine_key.to_string(),
            encoded_account: hex::encode(function_routine.try_to_vec().unwrap()),
        }),
    };
    register_and_send(runner_channel.clone().into(), processing_keys, runner_ctx).await;

    Ok(fn_routine_key)
}

/// Processes a function request by sending a container runner context to the runner channel.
/// Returns the function request key if successful, or an error if the request is not ready.
///
/// # Arguments
///
/// * `slot` - The current Solana slot.
/// * `fn_key` - The public key of the function account.
/// * `function` - The data stored in the function account.
/// * `fn_request_key` - The public key of the function request account.
/// * `function_request` - The data stored in the function request account.
/// * `queue_data` - The data stored in the attestation queue account.
/// * `verifier_pubkey` - The public key of the verifier account.
/// * `verifier_enclave_signer` - The public key of the verifier enclave signer account.
/// * `runner_channel` - The channel used to send the container runner context.
///
/// # Errors
///
/// Returns an error if the function request is not ready.
async fn process_request<'a>(
    processing_keys: Arc<RwLock<HashSet<String>>>,
    slot: u64,
    fn_key: &Pubkey,
    function: FunctionAccountData,
    fn_request_key: &'a Pubkey,
    function_request: &FunctionRequestAccountData,
    queue_data: &AttestationQueueAccountData,
    verifier_pubkey: &Pubkey,
    verifier_enclave_signer: &Pubkey,
    runner_channel: &Sender<ContainerRunnerCtx>,
) -> Result<&'a Pubkey, SbError> {
    // let now = Utc::now();
    // let half_minute = chrono::Duration::from_std(Duration::from_secs(30)).unwrap();

    let name = function.get_name();

    let ready_slot = function_request.active_request.valid_after_slot;
    let fallback_slot = ready_slot + 75;
    let is_primary = queue_data.data[function.queue_idx as usize] == *verifier_pubkey;
    let is_secondary = queue_data.data[queue_data.curr_idx as usize] == *verifier_pubkey;

    let primary_should_execute = is_primary && slot >= ready_slot;
    let secondary_should_steal_execution = is_secondary && slot >= fallback_slot;
    if !primary_should_execute && !secondary_should_steal_execution {
        println!("Req not ready {}", fn_request_key);
        return Err(SbError::CustomMessage("RequestNotReady".to_string()));
    }

    let runner_ctx = ContainerRunnerCtx {
        name,
        slot,
        verifier_signer: verifier_enclave_signer.to_string(),
        queue_authority: queue_data.authority.to_string(),
        fn_key: fn_key.to_string(),
        encoded_fn: hex::encode(bytemuck::bytes_of(&function)),
        job: SolanaContainerJob::Request(SolanaJob {
            name: fn_request_key.to_string(),
            pubkey: fn_request_key.to_string(),
            encoded_account: hex::encode(function_request.try_to_vec().unwrap()),
        }),
    };

    register_and_send(runner_channel.clone().into(), processing_keys, runner_ctx).await;

    Ok(fn_request_key)
}

pub async fn is_in_process_or_backoff(
    processing_keys: Arc<RwLock<HashSet<String>>>,
    backoff_map: Arc<RwLock<HashMap<String, (SystemTime, Duration)>>>,
    running_key: String,
) -> bool {
    if processing_keys.read().await.get(&running_key).is_some() {
        // println!("{} is still in progress", running_key);
        return true;
    }
    if let Some(&(next_executable_time, _)) = backoff_map.read().await.get(&running_key) {
        if next_executable_time > SystemTime::now() {
            // info!(
            // "[BACKOFF] {}: is in backoff for {:?} more seconds",
            // running_key.clone(),
            // next_executable_time.duration_since(SystemTime::now()),
            // {running_key: running_key.to_string()}
            // );
            return true;
        }
    }
    return false;
}
