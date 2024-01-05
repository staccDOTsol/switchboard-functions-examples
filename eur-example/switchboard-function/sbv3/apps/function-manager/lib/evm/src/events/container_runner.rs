use crate::*;
use bollard::errors::Error as BollardError;
use bollard::Docker;
use chrono::Utc;

use futures_util::TryFutureExt;
use rand::Rng;
use std::collections::HashMap;
use std::collections::HashSet;
use std::time::Duration;
use std::time::SystemTime;
use switchboard_common::*;
use tokio::sync::mpsc::UnboundedReceiver;
use tokio::sync::mpsc::UnboundedSender;
use tokio::sync::RwLock;
use tokio::sync::Semaphore;
use tokio::time::timeout;

pub struct ContainerRunnerCtx {
    pub name: String,
    pub fn_key: String,
    pub encoded_fn: String,
    pub fn_request_keys: Vec<String>,
    pub encoded_fn_reqs: Vec<String>,
    pub verifier_signer: String,
    pub queue_authority: String,
}

pub struct ContainerRunRoutineOptions {
    pub rx: UnboundedReceiver<ContainerRunnerCtx>,
    pub container_downloader_chan: UnboundedSender<String>,
    pub container_awaiter_chan: UnboundedSender<tokio::task::JoinHandle<Result<(), SbError>>>,
    pub payer: String,
    pub reward_receiver: String,
    pub verifier: String,
    pub verifying_contract: String,
    pub chain_id: String,
}

pub fn gen_unhandled_error_result(
    fn_key: String,
    fn_req_keys: Vec<String>,
    code: u8,
) -> FunctionResult {
    // generate a vector of size fn_req_keys.len() of [u8; 32] with all zeros
    let checksums = Vec::new();

    // generate a vector of code(s), size fn_req_keys.len()
    let error_codes = vec![code; fn_req_keys.len()];

    // generate EvmFunctionResultV1 struct for failure
    let evm_fr = EvmFunctionResultV1 {
        function_id: fn_key,
        signatures: Vec::new(),
        txs: Vec::new(),
        signer: String::new(),
        resolved_ids: fn_req_keys,
        checksums,
        error_codes,
    };

    FunctionResult::V1(FunctionResultV1 {
        quote: vec![],
        chain_result_info: ChainResultInfo::Evm(EvmFunctionResult::V1(evm_fr)),
        error_code: code,
        signature: Vec::new(),
        signer: Vec::new(),
    })
}

pub async fn container_runner_routine(
    docker: &Docker,
    qvn: Arc<Qvn>,
    mut ops: ContainerRunRoutineOptions,
) {
    // TODO NEED TO TRACK RUNNING KEYS AND NOT RUN IF ACTIVE!
    // Max parallel containers semaphore.
    let semaphore = Arc::new(Semaphore::new(15));
    let backoff_map = Arc::new(RwLock::new(HashMap::<String, (SystemTime, Duration)>::new()));
    let max_backoff = Duration::from_secs(300);
    let default_backoff = (SystemTime::UNIX_EPOCH, Duration::from_secs(5));
    let default_env = vec![
        format!("PAYER={}", ops.payer),
        format!("REWARD_RECEIVER={}", ops.reward_receiver),
        format!("VERIFIER={}", ops.verifier),
        format!("VERIFYING_CONTRACT={}", ops.verifying_contract),
        format!("CHAIN_ID={}", ops.chain_id),
    ];

    // NOTICE: Ensure this is full pubkey, not evm contracted with  ...
    let running_keys = Arc::new(RwLock::new(HashSet::<String>::new()));
    while let Some(ctx) = ops.rx.recv().await {
        let mdocker = docker.clone();
        let function_req_keys = ctx.fn_request_keys.clone();
        let mfunction_req_keys = function_req_keys.clone();
        let params = ctx.encoded_fn_reqs.clone();

        let params: String = base64::encode(serde_json::to_string(&params).unwrap());
        let mrunning_keys = running_keys.clone();
        let running_key = ctx.fn_key.clone();
        if let Some(&(next_executable_time, _)) = backoff_map.read().await.get(&running_key) {
            if next_executable_time > SystemTime::now() {
                continue;
            }
        }
        if let Some(_key) = running_keys.read().await.get(&running_key) {
            continue;
        }

        let request_keys = base64::encode(serde_json::to_string(&function_req_keys).unwrap());
        let mrequest_keys = request_keys.clone();
        let mrunning_key = running_key.clone();
        let fn_key = ctx.fn_key.clone();
        let default_env = default_env.clone();
        let qvn = qvn.clone();
        let mqvn = qvn.clone();
        let backoff_map = backoff_map.clone();
        let semaphore = semaphore.clone();
        let name = ctx.name.clone();
        mrunning_keys.write().await.insert(mrunning_key.clone());
        let fut = tokio::spawn(async move {
            println!("111");
            // Permit will be dropped on destructor
            let _permit = semaphore.acquire().await.unwrap();
            let start = Utc::now().timestamp();
            let container_run_future = timeout(
                Duration::from_secs(15),
                run_container(
                    &mdocker,
                    mrunning_key.clone(),
                    vec![mrequest_keys.clone()], // TODO: fix
                    name.clone(),
                    [
                        default_env.clone(),
                        vec![
                            format!("FUNCTION_KEY={}", fn_key),
                            format!("FUNCTION_CALL_IDS={}", request_keys),
                            format!("FUNCTION_PARAMS={}", params),
                        ],
                    ]
                    .concat(),
                    12,
                )
                .and_then(|r| async move {
                    // Get FunctionResultV1 enum from fr
                    let r = if let FunctionResult::V1(fr) = r {
                        fr
                    } else {
                        println!("f123: {:?}", r);
                        return Err(SbError::FunctionResultParseError);
                    };

                    let latency = Utc::now().timestamp() - start;
                    println!("{} completed in {}", mrunning_key, latency);

                    // RUNTIME_GAUGE
                    // .with_label_values(&[
                    // &Env::get().CHAIN,
                    // &Env::get().QUOTE_KEY,
                    // &fn_key,
                    // &mrequest_keys,
                    // ])
                    // .set(latency as f64);
                    // FN_ERROR_CODE_GAUGE
                    // .with_label_values(&[
                    // &Env::get().CHAIN,
                    // &Env::get().QUOTE_KEY,
                    // &fn_key,
                    // &mrequest_keys,
                    // ])
                    // .set(r.error_code as f64);

                    mqvn.send_result(&FunctionResult::V1(r)).await
                }),
            )
            .await;
            mrunning_keys.write().await.remove(&running_key);

            let result = if container_run_future.is_err() {
                Err(SbError::ContainerTimeout)
            } else {
                container_run_future.unwrap()
            };
            if let Err(err) = result {
                let mut qvn_error = Ok(Default::default());
                let efn_key = ctx.fn_key.clone();

                // get efn_key from hex string with ethers to Vec<u8>
                if let SbError::FunctionResultParseError = err {
                    qvn_error = qvn // TODO: replace empty vec with fn_req_key
                        .send_result(&gen_unhandled_error_result(
                            efn_key,
                            mfunction_req_keys,
                            253,
                        ))
                        .await;
                } else if let SbError::ContainerTimeout = err {
                    qvn_error = qvn // TODO: replace empty vec with fn_req_key
                        .send_result(&gen_unhandled_error_result(
                            efn_key,
                            mfunction_req_keys,
                            255,
                        ))
                        .await;
                }
                if qvn_error.is_err() {
                    println!("QVN_FAILED TO SEND ERROR CODE --> {:?}", qvn_error);
                }
                if let SbError::ContainerStartError(err) = err {
                    let inner_error: &(dyn std::error::Error + Send + Sync + 'static) = &*err;
                    if let Some(BollardError::DockerResponseServerError { status_code, .. }) =
                        inner_error.downcast_ref::<BollardError>()
                    {
                        info!("Docker server status code {}", status_code, {fn_key: ctx.fn_key, request: running_key});
                        if *status_code == 404 {
                            // println!("-->Requesting download of img {}", ctx.name.clone());
                        }
                    }
                }
                let rand_backoff: u64 = ((rand::thread_rng().gen::<u8>() % 10) + 1).into();
                let backoff = backoff_map
                    .read()
                    .await
                    .get(&running_key)
                    .unwrap_or(&default_backoff)
                    .1;
                let backoff = std::cmp::min(
                    Duration::from_secs(backoff.as_secs() + 10 + rand_backoff),
                    max_backoff,
                );
                info!(
                    "ADDING BACKOFF: {}:{} {}",
                    running_key,
                    name,
                    backoff.as_secs()
                );
                // // UNHANDLED_ERROR_COUNTER
                // // .with_label_values(&[
                // // &Env::get().CHAIN,
                // // &Env::get().QUOTE_KEY,
                // // &ctx.fn_key,
                // // &request_keys,
                // // ])
                // // .inc();
                backoff_map
                    .write()
                    .await
                    .insert(running_key, (SystemTime::now() + backoff, backoff));
            } else if backoff_map.write().await.remove(&running_key).is_some() {
                info!("REMOVING BACKOFF: {}:{}", running_key, name.clone());
            }

            Ok(())
        });
        ops.container_awaiter_chan.send(fut).unwrap();
        ops.container_downloader_chan
            .send(ctx.name.clone())
            .unwrap();
    }
}
