use crate::*;

use chrono::Utc;
use futures::future::try_join_all;
use futures_util::TryFutureExt;
use rand::Rng;
use std::collections::HashMap;
use std::collections::HashSet;
use std::time::Duration;
use std::time::{SystemTime, UNIX_EPOCH};
use switchboard_common::SbError;
use switchboard_common::SbFunctionError;
use switchboard_container_utils::ContainerManager;
use tokio::sync::RwLock;

pub fn log_if_unrecoverable_error(qvn_err: Result<QvnResponse, switchboard_common::SbError>) {
    if qvn_err.is_err() {
        println!(
            "[QVN-FALLBACK]: QVN_FAILED TO SEND ERROR CODE --> {:?}",
            qvn_err
        );
    } else if let Some(qvn_err) = qvn_err.unwrap().error {
        println!(
            "[QVN-FALLBACK]: QVN_FAILED TO SEND ERROR CODE --> {:?}",
            qvn_err
        );
    }
}

pub fn gen_unhandled_error_result(
    fn_key: &String,
    fn_req_key: &String,
    request_type_meta: RequestType,
    code: u8,
) -> switchboard_common::FunctionResult {
    let fn_key: Pubkey = fn_key.parse().unwrap();
    let fn_req_key: Pubkey = fn_req_key.parse().unwrap();
    let mut request_type = SolanaFunctionRequestType::Routine(fn_req_key.to_bytes().to_vec());
    if request_type_meta == RequestType::Routine {
        request_type = SolanaFunctionRequestType::Routine(fn_req_key.to_bytes().to_vec());
    } else if request_type_meta == RequestType::Request {
        request_type = SolanaFunctionRequestType::Request(fn_req_key.to_bytes().to_vec());
    } else {
        request_type = SolanaFunctionRequestType::Function(fn_req_key.to_bytes().to_vec());
    }
    switchboard_common::FunctionResult::V1(switchboard_common::FunctionResultV1 {
        signer: fn_key.to_bytes().to_vec(),
        error_code: code,
        chain_result_info: switchboard_common::ChainResultInfo::Solana(
            SolanaFunctionResult::V1(SolanaFunctionResultV1 {
                fn_key: fn_key.to_bytes().to_vec(),
                request_type,
                ..Default::default()
            }),
        ),
        ..Default::default()
    })
}

// pub async fn register_runner_complete(processing_keys: Arc<RwLock<HashSet<String>>>, key: String) {
// if processing_keys.write().await.remove(&key) {
// println!("[CACHE] {} removed from active containers", key.clone());
// }
// }

pub async fn container_runner_routine(
    processing_keys: Arc<RwLock<HashSet<String>>>,
    backoff_map: Arc<RwLock<HashMap<String, (SystemTime, Duration)>>>,
    last_ex_map: Arc<RwLock<HashMap<String, u64>>>,
    container_manager: Arc<DockerManager>,
    qvn: Arc<Qvn>,
    ops: ContainerRunRoutineOptions,
) {
    let mut worker_handles = vec![];
    for _ in 0..Env::get().NUM_WORKERS {
        clone!(processing_keys, backoff_map, last_ex_map, container_manager, qvn, ops);
        worker_handles.push(tokio::spawn(async move {
            while let Ok(ctx) = ops.rx.recv().await {
                let time = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_secs();
                println!("Worker channel len: {}", ops.rx.len());
                println!("Starting work on {} at {}", ctx.fn_key, time);
                let key = ctx.running_key();
                clone!(backoff_map, last_ex_map, container_manager, qvn, ops);
                worker(ctx, backoff_map, last_ex_map, container_manager, qvn, ops).await;
                processing_keys.write().await.remove(&key);
                println!("[CACHE] {} removed from active containers", key.clone());
            }
        }));
    }
    try_join_all(worker_handles).await.unwrap();
    panic!("FAILURE!");
}

pub async fn worker(
    ctx: ContainerRunnerCtx,
    backoff_map: Arc<RwLock<HashMap<String, (SystemTime, Duration)>>>,
    last_ex_map: Arc<RwLock<HashMap<String, u64>>>,
    container_manager: Arc<DockerManager>,
    qvn: Arc<Qvn>,
    ops: ContainerRunRoutineOptions,
) {
    let (name, fn_key, request_type, running_key, id) = ctx.parse();
    println!("Received {}", running_key);
    let default_env = vec![
        format!("PAYER={}", ops.payer),
        format!("REWARD_RECEIVER={}", ops.reward_receiver),
        format!("VERIFIER={}", ops.verifier),
        format!("CLUSTER={}", ops.cluster),
    ];
    let max_backoff = Duration::from_secs(30);
    let default_backoff = (SystemTime::UNIX_EPOCH, Duration::from_secs(10));
    let env = ctx.to_env(&default_env);

    // TODO: only start if available
    /// NOTE, at least 6-8 seconds on 256 MEM, .25 CPU
    let config = build_config(name.clone().as_str(), &env, false, 512, 0.25);
    let container = container_manager
        .create_docker_container(
            id.clone().as_str(),
            name.clone().as_str(),
            Some(env),
            None,
            Some(config),
        )
        .await;
    if container.is_err() {
        println!(
            "[DOCKER] Container {} cannot be run: {:?}",
            id,
            container.err().unwrap()
        );
        // ADD max backoff here, only if tag isnt latest
        let backoff = max_backoff;
        backoff_map.write().await.insert(
            running_key.to_string(),
            (SystemTime::now() + backoff, backoff),
        );
        let code = SbFunctionError::SwitchboardError(249).as_u8();
        log_if_unrecoverable_error(
            qvn.send_result(&gen_unhandled_error_result(&fn_key, &running_key, request_type, code))
                .await,
        );
        return;
    }
    let container = container.unwrap();
    let start = Utc::now().timestamp();

    let timeout = Env::get().CONTAINER_TIMEOUT;
    info!("Running container {} ({}) with {}s timeout", ctx.name.clone(), container.id, timeout, {fn_key: fn_key.to_string(), request: running_key.to_string()});

    let mrunning_key = running_key.to_string();
    let mfn_key = fn_key.to_string();
    let mid = Arc::new(id.clone());
    let mqvn = qvn.clone();
    let time = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let encoded_fn = hex::decode(ctx.encoded_fn).unwrap();
    let func: &FunctionAccountData = bytemuck::try_from_bytes(&encoded_fn[..]).unwrap();
    let last_run: u64 = func.last_execution_timestamp.try_into().unwrap();
    label!(LATENCY_TRACKER, [&mfn_key, &mrunning_key]).set((time - last_run) as f64);
    last_ex_map.write().await.insert(mrunning_key.clone(), time);
    let run_result: Result<QvnResponse, switchboard_common::SbError> = container.run_and_decode(Some(timeout.into()), |log| {
        let mrunning_key = Arc::new(running_key.to_string());
        let mfn_key = Arc::new(fn_key.to_string());
        async move {
            if log.starts_with("FN_OUT:") {
                info!("FN_OUT: ...", { fn_key: (*mfn_key).clone(), request: (*mrunning_key).clone() });
                return;
            }
            if log.is_empty() || SILENCED_SUBSTRS.iter().any(|&substring| log.contains(substring)) {
                return;
            }
            info!("LOG: {}", log, { fn_key: (*mfn_key).clone(), request: (*mrunning_key).clone() });
        }
    })
    .and_then(|function_result| async move {
        let latency = Utc::now().timestamp() - start;
        println!("[LATENCY] {} completed in {} seconds", mid.clone(), latency);
        info!("Function completed in {} seconds", latency, {fn_key: mfn_key.to_string(), request: mrunning_key.to_string()});
        label!(RUNTIME_GAUGE, [&mfn_key, &mrunning_key]).set(latency as f64);

        let code = function_result.error_code().to_string();
        info!("Error code {}", code, {fn_key: mfn_key.clone(), request: mrunning_key.clone()});
        label!(FN_ERROR_CODE_GAUGE, [&mfn_key, &mrunning_key, &code]).inc();

        let qvn_response = mqvn.send_result(&function_result).await?;
        info!("qvn_response {:?}", qvn_response, {fn_key: mfn_key.to_string(), request: mrunning_key.to_string()});
        if let Some(err) = qvn_response.error {
            info!("Function error: {}", err, {fn_key: mfn_key.to_string(), request: mrunning_key.to_string()});
            return Err(SbError::QvnError(err.into()));
        }

        Ok(qvn_response)
    })
    .await;
    if run_result.is_ok() {
        if backoff_map
            .write()
            .await
            .remove(running_key.as_str())
            .is_some()
        {
            info!("Function backoff removed", {fn_key: ctx.fn_key.clone(), request: running_key.clone()});
        }
        return;
    }
    let fn_key = ctx.fn_key.clone();
    let rand_backoff: u64 = ((rand::thread_rng().gen::<u8>() % 10) + 1).into();
    let backoff = backoff_map
        .read()
        .await
        .get(running_key.as_str())
        .unwrap_or(&default_backoff)
        .1;
    let backoff = std::cmp::min(
        Duration::from_secs(backoff.as_secs() + 5 + rand_backoff),
        max_backoff,
    );
    backoff_map.write().await.insert(
        running_key.to_string(),
        (SystemTime::now() + backoff, backoff),
    );

    let code;
    // println!("{:?}", run_result);
    let container_run_err = run_result.err().unwrap();
    match container_run_err {
        SbError::FunctionResultParseError => {
            println!("[FunctionResultParseError] {}", id.clone());
            info!("Function failed to produce result", {fn_key: fn_key.clone(), request: running_key.clone()});
            code = SbFunctionError::FunctionResultNotFound.as_u8();
        }
        SbError::ContainerTimeout => {
            println!("[ContainerTimeout] {}", id.clone());
            info!("Timeout", {fn_key: fn_key, request: running_key});
            code = SbFunctionError::FunctionTimeout.as_u8();
        }
        SbError::ContainerStartError(err) => {
            println!("[ContainerStartError] {}", id.clone());
            info!("Docker error {:?}", err, {fn_key: fn_key, request: running_key});
            code = SbFunctionError::ContainerUnavailable.as_u8();
        }
        _ => {
            println!("[CallbackError] {}, {:?}", id.clone(), container_run_err);
            info!("[CallbackError] {:?}", container_run_err, {fn_key: ctx.fn_key, request: running_key});
            info!("Function callback failed", {fn_key: ctx.fn_key, request: running_key});
            code = SbFunctionError::CallbackError.as_u8();
        }
    }
    info!("[BACKOFF] added: {} secs", backoff.as_secs(), {fn_key: ctx.fn_key.clone(), request: running_key.clone()});
    log_if_unrecoverable_error(
        qvn.send_result(&gen_unhandled_error_result(&fn_key, &running_key, request_type, code))
            .await,
    );
}
