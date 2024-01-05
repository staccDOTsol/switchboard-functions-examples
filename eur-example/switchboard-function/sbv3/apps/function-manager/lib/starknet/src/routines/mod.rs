use crate::qvn::*;
use crate::*;
use bollard::Docker;
use chrono::DateTime;
use chrono::NaiveDateTime;
use chrono::Utc;
use cron::Schedule;
use std::sync::Arc;
// use ethers::{
//     core::{k256::ecdsa::SigningKey, types::Address},
//     middleware::SignerMiddleware,
//     providers::{Http, Provider},
//     signers::Wallet,
// };
use futures::future::join_all;
use futures_util::FutureExt;
use futures_util::TryFutureExt;
use serde_json;
use starknet::core::utils::parse_cairo_short_string;
use std::collections::HashMap;
use std::time::Duration;
use std::time::SystemTime;

// use sdk::FunctionCall;
// use sdk::Switchboard;
use sdk::{Switchboard,*};
use starknet::{
    accounts::{ExecutionEncoding, SingleOwnerAccount},
    core::types::{BlockId, BlockTag, EventFilter, FieldElement},
    macros::{abigen, felt},
    providers::{jsonrpc::HttpTransport, JsonRpcClient, Provider,SequencerGatewayProvider},
    signers::{LocalWallet, SigningKey, Signer},
};

use tokio::time::{interval, Interval};

// type EVMContract = Switchboard<SignerMiddleware<Provider<Http>, Wallet<SigningKey>>>;

// #[derive(Debug, Clone)]
// enum ParsedFunctionStatus {
//     #[default]
//     None,
//     Active,
//     NonExecutable,
//     Expired,
//     OutOfFunds,
//     InvalidPermissions,
//     Deactivated,
// }

#[derive(Debug, Clone)]
struct ParsedFunctionConfig {
    // The encoded cron schedule at which this function will be executed.
    schedule: String,
    // The registry in which the specified container can be located.
    container_registry: String,
    // The name of the container to run.
    container: Vec<String>,
    // The version of the container to run.
    version: String,
    // The measurements that are allowed to submit results to this function.
    mr_enclaves: Vec<u128>,
}

#[derive(Debug,Clone)]
struct ParsedFunctionState {
    // The number of times that this function's execution has failed consecutively.
    consecutive_failures: String,
    // The timestamp that this function was last executed at.
    last_execution_timestamp: u64,
    // The gas cost of the last execution of this function.
    last_execution_gas_cost: String,
    // The timestamp that this function is next allowed to be executed at.
    next_allowed_timestamp: u64,
    // The first time this function was triggered.
    triggered_since: String,
    // Number of times this function has been triggered.
    triggered_count: String,
    // Whether this function is currently in a 'triggered' state or not.
    triggered: bool,
    queue_idx: String,
}

#[derive(Debug,Clone)]
enum ParsedFunctionStatus {
    None,
    Active,
    NonExecutable,
    Expired,
    OutOfFunds,
    InvalidPermissions,
    Deactivated,
}
#[derive(Debug,Clone)]
struct ParsedFunction {
    id: String,
    name: String,
    authority: FieldElement,
    verifier: FieldElement,
    attestation_queue: FieldElement,
    created_at: u64,
    updated_at: u64,
    status: ParsedFunctionStatus,
    config: ParsedFunctionConfig,
    state: ParsedFunctionState,
}

fn parse_function_felts(func: &Function) -> ParsedFunction {
    let container: Vec<String> = func
        .config
        .container
        .into_iter()
        .map(|f| parse_cairo_short_string(&f).expect("failed"))
        .collect();
    let mr_enclaves: Vec<u128> = func
        .config
        .mr_enclaves
        .into_iter()
        .map(|mre| mre.high)
        .collect();
    ParsedFunction {
        id: parse_cairo_short_string(&func.id).expect("failed"),
        name: parse_cairo_short_string(&func.name).expect("failed"),
        authority: func.authority.0,
        verifier: func.verifier.into(),
        attestation_queue: func.attestation_queue.into(),
        created_at: func.created_at,
        updated_at: func.updated_at,
        status: match func.status{
            FunctionStatus::None => ParsedFunctionStatus::None,
            FunctionStatus::Active => ParsedFunctionStatus::Active,
            FunctionStatus::NonExecutable => ParsedFunctionStatus::NonExecutable,
            FunctionStatus::Expired => ParsedFunctionStatus::Expired,
            FunctionStatus::OutOfFunds => ParsedFunctionStatus::OutOfFunds,
            FunctionStatus::InvalidPermissions => ParsedFunctionStatus::InvalidPermissions,
            FunctionStatus::Deactivated => ParsedFunctionStatus::Deactivated,
        },
        config: ParsedFunctionConfig {
            schedule: parse_cairo_short_string(&func.config.schedule).expect("failed"),
            container_registry: parse_cairo_short_string(&func.config.container_registry)
                .expect("failed"),
            container,
            version: parse_cairo_short_string(&func.config.version).expect("failed"),
            mr_enclaves: mr_enclaves,
        },
        state: ParsedFunctionState {
            consecutive_failures: parse_cairo_short_string(&func.state.consecutive_failures)
                .expect("failed"),
            last_execution_timestamp: func.state.last_execution_timestamp,
            last_execution_gas_cost: parse_cairo_short_string(&func.state.last_execution_gas_cost)
                .expect("failed"),
            next_allowed_timestamp: func.state.next_allowed_timestamp,
            triggered_since: parse_cairo_short_string(&func.state.triggered_since).expect("failed"),
            triggered_count: parse_cairo_short_string(&func.state.triggered_count).expect("failed"),
            triggered: func.state.triggered,
            queue_idx: parse_cairo_short_string(&func.state.queue_idx).expect("failed"),
        },
    }
}
pub async fn function_check_routine(
    docker: &Docker,
    contract: Switchboard<'_,SingleOwnerAccount<JsonRpcClient<HttpTransport>,LocalWallet>>,
    qvn: &Qvn,
) {
    let mut interval: Interval = interval(Duration::from_secs(5));

    // get EVM payer
    let payer = &Env::get().PAYER_SECRET;
    let docker_key = &Env::get().DOCKER_KEY;
    // get QVN
    let verifier_id = &Env::get().QUOTE_KEY;

    let verifier_id = FieldElement::from_hex_be(verifier_id).unwrap();
    let verifier_data = contract.reader.get_verifier(&verifier_id).await;
    if let Err(e) = verifier_data {
        println!("Error getting quote: {:?}", e);
        return;
    }
    let verifier_data = verifier_data.unwrap();
    let chain_id: u64 = Env::get().CHAIN_ID;

    // get quote's attestation queue
    let queue_id = verifier_data.id.clone();
    let default_env = vec![
        format!("PAYER={}", payer),
        format!("REWARD_RECEIVER={:?}", verifier_data.authority),
        format!("VERIFIER={:?}", verifier_id),
        format!("VERIFYING_CONTRACT={:?}", contract.address),
        format!("CHAIN_ID={}", chain_id),
    ];

    let default_backoff = (SystemTime::now(), Duration::from_secs(5));
    let max_backoff = Duration::from_secs(300);
    let mut backoff_map = HashMap::<FieldElement, (SystemTime, Duration)>::new();

    let half_minute = chrono::Duration::from_std(Duration::from_secs(30)).unwrap();
    loop {
        println!("QUEUE_ID {:?}", queue_id);
        // get the qvns on the queue
        let queue_data = contract.reader.get_attestation_queue(&queue_id).await;
        if let Err(e) = queue_data {
            println!("Error getting queue data: {:?}", e);
            continue;
        }
        let queue_data: Vec<FieldElement> = queue_data.unwrap().verifiers;
        if queue_data.len() == 0 {
            interval.tick().await;
            continue;
        }

        // get the qvns on the queue
        let queue_fields = contract.reader.get_attestation_queue(&queue_id).await;
        if let Err(e) = queue_fields {
            println!("Error getting queue fields: {:?}", e);
            return;
        }
        let queue_fields = queue_fields.unwrap();

        // get active functions on the queue
        let functions_result = contract.reader.get_active_functions_for_queue(&queue_id).await;

        if let Err(e) = functions_result {
            println!("Error getting active functions on queue: {:?}", e);
            continue;
        }
        // let (function_ids, function_data) = functions_result.unwrap();
        let active_functions = functions_result.unwrap();

        let function_ids: Vec<FieldElement> =
            active_functions.iter().map(|func| func.id).collect();
        let functions = function_ids.iter().zip(active_functions.iter());

        println!("Found {} functions", function_ids.len());

        // zip functions [ (<address1>,<function1>), (<address2>,<functions2>)... ]
        // let functions = function_ids.iter().zip(function_data.iter());

        let mut runs = vec![];
        // let mut param_runs = vec![];

        let now = Utc::now();

        // hash map of function_id to function
        let mut function_map = HashMap::<FieldElement, ParsedFunction>::new();

        for (fn_key, function) in functions {
            let function = parse_function_felts(function);
            // write function to function_map
            function_map.insert(fn_key.clone(), function.clone());

            if let Some(&(next_executable_time, _)) = backoff_map.get(&fn_key) {
                if next_executable_time > SystemTime::now() {
                    continue;
                }
            }

            // check if it's the primary node assigned
            let is_primary_assigned = queue_data
                [function.state.queue_idx.parse::<usize>().unwrap() % queue_data.len()] == verifier_id;
            let is_secondary_assigned =
                queue_data[queue_fields.cur_idx as usize % queue_data.len()] == verifier_id;

            let current_time = u64::try_from(now.timestamp()).unwrap();
            let next_allowed_timestamp = function.state.next_allowed_timestamp;
            let staleness = if next_allowed_timestamp > current_time {
                0
            } else {
                current_time - next_allowed_timestamp
            };

            // check if backup node should steal execution
            let should_steal_execution = is_secondary_assigned
                && staleness > u64::try_from(half_minute.num_seconds()).unwrap();

            // check should_execute -
            let mut should_execute = true;

            {
                let schedule_str = function.config.schedule.clone();
                let every_second = Schedule::try_from("* * * * * *").unwrap();
                let schedule_string = if schedule_str == "" {
                    "* * * * * *"
                } else {
                    schedule_str.trim_end_matches('\0')
                };

                let schedule = Schedule::try_from(schedule_string);
                let schedule = schedule.unwrap_or(every_second.clone());

                // if it's triggered with a functionCall, it'll run in the next loop
                if function.config.schedule.as_str() == "" {
                    should_execute = false
                } else {
                    let dt: chrono::DateTime<Utc> = DateTime::from_utc(
                        NaiveDateTime::from_timestamp_opt(
                            i64::try_from(function.state.next_allowed_timestamp).unwrap(),
                            0,
                        )
                        .unwrap(),
                        Utc,
                    );
                    let next_trigger_time = schedule.after(&dt).next();
                    if next_trigger_time.is_none() {
                        should_execute = false
                    } else if next_trigger_time.unwrap() > now {
                        should_execute = false;
                    }
                }
            }

            if (is_primary_assigned && should_execute) || should_steal_execution {
                let qvn = qvn.clone();
                let mdocker = docker.clone();
                let default_env = default_env.clone();
                let container_name = &function.config.container.clone()[0]; // until starknet supports long strings
                let container_name = if !container_name.contains(":") {
                    format!("{}:{}", function.config.container.clone()[0], "latest",)
                } else {
                  (*container_name.clone()).to_string()
                };
                let fn_key = fn_key.clone();

                runs.push(tokio::spawn(async move {
                    run_container(
                        &mdocker,
                        docker_key.to_string(),
                        vec![],
                        container_name,
                        [
                            default_env.clone(),
                            vec![format!("FUNCTION_KEY={:?}", fn_key)],
                        ]
                        .concat(),
                        20,
                    )
                    .and_then(|r| async move { qvn.send_result(&r).await })
                    .await
                }));
            }
        }

        // the runs after this might be param runs
        // Fetch all function requests
        // let function_requests = contract
        //     .get_active_function_calls_by_queue(queue_id)
        //     .call()
        //     .await;
        //
        // if let Err(e) = function_requests {
        //     println!("Error getting active functions on queue: {:?}", e);
        //     continue;
        // }
        //
        // let function_requests = function_requests.unwrap();
        // let (function_call_ids, function_calls) = function_requests;
        //
        // // zip functions [ (<address1>,<function_call1>), (<address2>,<function_call2>)... ]
        // let functions_requests = function_call_ids.iter().zip(function_calls.iter());
        //
        // println!("Found {} function requests", functions_requests.len());
        //
        // // get function requests by function_call.function_id
        // let mut function_requests_by_function_id =
        //     HashMap::<Address, Vec<(Address, FunctionCall)>>::new();
        // for (function_call_id, function_call) in functions_requests {
        //     let function_id = function_call.function_id;
        //     let function_requests = function_requests_by_function_id
        //         .entry(function_id)
        //         .or_insert(vec![]);
        //     function_requests.push((*function_call_id, function_call.clone()));
        // }
        //
        // // get list of function ids
        // let function_ids_with_params = function_requests_by_function_id
        //     .keys()
        //     .cloned()
        //     .collect::<Vec<Address>>();
        //
        // // iterate through each of the function id vecs in function_requests_by_function_id
        // for (function_id, function_requests) in function_requests_by_function_id {
        //     if let Some(&(next_executable_time, _)) = backoff_map.get(&function_id) {
        //         if next_executable_time > SystemTime::now() {
        //             continue;
        //         }
        //     }
        //
        //     // get function
        //     let function = function_map.get(&function_id);
        //     if function.is_none() {
        //         continue;
        //     }
        //     let function = function.unwrap();
        //
        //     // check if it's the primary node assigned
        //     let is_primary_assigned =
        //         queue_data[function.state.queue_idx.as_usize() % queue_data.len()] == verifier_id;
        //     let is_secondary_assigned =
        //         queue_data[queue_fields.curr_idx.as_usize() % queue_data.len()] == verifier_id;
        //
        //     // check if this node should steal execution
        //     let current_time = u64::try_from(now.timestamp()).unwrap();
        //     let next_allowed_timestamp = function.state.next_allowed_timestamp.as_u64();
        //     let staleness = if next_allowed_timestamp > current_time {
        //         0
        //     } else {
        //         current_time - next_allowed_timestamp
        //     };
        //
        //     // check if backup node should steal execution
        //     let should_steal_execution = is_secondary_assigned
        //         && staleness > u64::try_from(half_minute.num_seconds()).unwrap();
        //
        //     // We want to run all function calls that are assigned to this node
        //     if is_primary_assigned || should_steal_execution {
        //         let qvn = qvn.clone();
        //         // get container name
        //         let container_name = function.config.container.clone();
        //         let container_name = if !container_name.contains(":") {
        //             format!("{}:{}", function.config.container.clone(), "latest",)
        //         } else {
        //             container_name
        //         };
        //
        //         // get params for function that the function call can respond to
        //         let params = function_requests
        //             .iter()
        //             .map(|(_, function_call)| {
        //                 let params = function_call.calldata.clone();
        //                 params.to_vec()
        //             })
        //             .collect::<Vec<Vec<u8>>>();
        //         let params: String = serde_json::to_string(&params).unwrap();
        //
        //         // get function_call_ids for function that the function call can respond to
        //         let function_call_ids_as_vecs = function_requests
        //             .iter()
        //             .map(|(function_call_id, _)| function_call_id.as_bytes().to_vec())
        //             .collect::<Vec<Vec<u8>>>();
        //
        //         let function_call_ids: String =
        //             serde_json::to_string(&function_call_ids_as_vecs).unwrap();
        //
        //         // clone docker
        //         let mdocker = docker.clone();
        //         let fn_key = function_id.clone();
        //         let default_env = default_env.clone();
        //
        //         param_runs.push(tokio::spawn(async move {
        //             run_container(
        //                 &mdocker,
        //                 docker_key.to_string(),
        //                 container_name,
        //                 [
        //                     default_env.clone(),
        //                     vec![
        //                         format!("FUNCTION_KEY={:?}", fn_key),
        //                         format!("FUNCTION_CALL_IDS={}", function_call_ids),
        //                         format!("FUNCTION_PARAMS={}", params),
        //                         // pass first index of function_call_ids to function
        //                         format!(
        //                             "FUNCTION_REQUEST_KEY={:?}",
        //                             Address::from_slice(function_call_ids_as_vecs[0].as_slice()),
        //                         ),
        //                     ],
        //                 ]
        //                 .concat(),
        //                 20,
        //             )
        //             .and_then(|r| async move { qvn.send_result(&r).await })
        //             .await
        //         }));
        //     }
        // }

        let results = join_all(runs).await;
        for (idx, result) in results.iter().enumerate() {
            let key = function_ids[idx];
            if result.is_err() {
                let backoff = backoff_map.get(&key).unwrap_or(&default_backoff).1;
                let backoff =
                    std::cmp::min(Duration::from_secs(backoff.as_secs() + 5), max_backoff);
                backoff_map.insert(key, (SystemTime::now() + backoff, backoff));
            } else {
                backoff_map.remove(&key);
            }
        }

        // let results = join_all(param_runs).await;
        // for (idx, result) in results.iter().enumerate() {
        //     // get Vec of keys from function_requests_by_function_id
        //     let key = function_ids_with_params[idx];
        //     if result.is_err() {
        //         let backoff = backoff_map.get(&key).unwrap_or(&default_backoff).1;
        //         let backoff =
        //             std::cmp::min(Duration::from_secs(backoff.as_secs().pow(2)), max_backoff);
        //         backoff_map.insert(key, (SystemTime::now() + backoff, backoff));
        //     } else {
        //         backoff_map.remove(&key);
        //     }
        // }

        interval.tick().await;
    }
}
