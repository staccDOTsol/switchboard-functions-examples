use crate::qvn::*;
use crate::*;

use chrono::DateTime;
use chrono::NaiveDateTime;
use chrono::Utc;
use cron::Schedule;
use ethers::{
    core::{k256::ecdsa::SigningKey, types::Address},
    middleware::SignerMiddleware,
    providers::{Http, Provider},
    signers::Wallet,
};
use sdk::Request;
use sdk::Routine;
use sdk::Switchboard;
use std::time::SystemTime;
use std::collections::HashMap;
use std::time::Duration;
use tokio::sync::mpsc::UnboundedSender;
use tokio::time::{interval, Interval, MissedTickBehavior};
use tokio::sync::RwLock;

type EVMContract = Switchboard<SignerMiddleware<Provider<Http>, Wallet<SigningKey>>>;

macro_rules! handle_or {
    // Handle Result type with continue
    ($expr:expr, $err_fn:expr, continue) => {
        match $expr {
            Ok(val) => val,
            Err(e) => {
                $err_fn(e);
                continue;
            }
        }
    };
    // Handle Result type without continue (default to return)
    ($expr:expr, $err_fn:expr $(,)?) => {
        match $expr {
            Ok(val) => val,
            Err(e) => {
                $err_fn(e);
                // return;
            }
        }
    };
}

pub fn routine_is_ready(routine: &Routine, now: chrono::DateTime<Utc>) -> bool {
    let schedule_str = routine.schedule.clone(); // crontab style string as String
    let every_second = Schedule::try_from("* * * * * *").unwrap();
    let schedule_string = if schedule_str == "" {
        "* * * * * *"
    } else {
        schedule_str.trim_end_matches('\0')
    };

    let schedule = Schedule::try_from(schedule_string);
    let schedule = schedule.unwrap_or(every_second.clone());

    let dt: chrono::DateTime<Utc> = DateTime::from_utc(
        NaiveDateTime::from_timestamp_opt(
            i64::try_from(routine.last_called_at.as_u64()).unwrap_or_default(),
            0,
        )
        .unwrap(),
        Utc,
    );
    let next_trigger_time = schedule.after(&dt).next();

    // IF schedule_str is empty, then filter it out
    if schedule_str == "" {
        info!("No schedule found for function routine: {:?}", routine.function_id);
        false
    } else if next_trigger_time.is_none() {
        info!("No next trigger time for function routine: {:?}", routine.function_id);
        false
    // Handle case where next trigger time is in the future
    } else if next_trigger_time.unwrap_or(now) > now {
        info!("{:?} next trigger time: {:?} {:?}", routine.function_id, next_trigger_time, now);
        false
    // Handle case where next trigger time is in the past (or now)
    } else {
        true
    }
}

pub async fn function_check_routine(
    contract: EVMContract,
    _qvn: &Qvn,
    runner_channel: UnboundedSender<ContainerRunnerCtx>,
) {
    let time_lock = Arc::new(RwLock::new(SystemTime::now()));
    let time_lock_clone = time_lock.clone();
    let _stall_check_handle = tokio::spawn(async move {
        let mut interval: Interval = interval(Duration::from_secs(1));
        interval.set_missed_tick_behavior(MissedTickBehavior::Delay);
        loop {
            let read_time = time_lock_clone.read().await;
            if read_time.elapsed().unwrap() > Duration::from_secs(30) {
                println!("Stalled");
                std::process::exit(1);
            }
            interval.tick().await;
        }
    });

    let mut interval: Interval = interval(Duration::from_secs(1));
    interval.set_missed_tick_behavior(MissedTickBehavior::Delay);

    // get QVN
    let verifier_id = &Env::get().QUOTE_KEY;

    let verifier_id = verifier_id.parse::<Address>().unwrap();
    let verifier_data = contract.enclaves(verifier_id).call().await;
    if let Err(e) = verifier_data {
        println!("Error getting quote: {:?}", e);
        return;
    }
    let verifier_data = verifier_data.unwrap();

    // get quote's attestation queue
    let queue_id = verifier_data.queue_id.clone();
    let half_minute = chrono::Duration::from_std(Duration::from_secs(30)).unwrap();

    loop {
        *time_lock.write().await = SystemTime::now();
        let available_mem = sys_info::mem_info().unwrap().avail / 1024;
        let cpu_load = sys_info::loadavg().unwrap().one;
        let num_cpu = sys_info::cpu_num().unwrap();
        println!(
            "MEM: {}, CPU: {}, NUM_CPU: {}",
            available_mem, cpu_load, num_cpu
        );

        // // pause if we're not ready
        // if !*qvn.is_ready.read().await {
        //     println!("Waiting for qvn to boot..");
        //     interval.tick().await;
        //     continue;
        // };

        // get the qvns on the queue
        let queue_data: Vec<Address> = handle_or!(
            contract.get_enclaves(queue_id).call().await,
            |e| info!("Error getting queue data: {:?}", e),
            continue
        );

        if queue_data.len() == 0 {
            info!("Queue is empty");
            interval.tick().await;
            continue;
        }

        // get the qvns on the queue
        let queue_fields = handle_or!(
            contract.attestation_queues(queue_id).call().await,
            |e| error!("{:?}", e),
            continue
        );

        // get active functions on the queue
        let (function_ids, function_data) = handle_or!(
            contract
                .get_active_functions_by_queue(queue_id)
                .call()
                .await,
            |e| println!("Error getting active functions on queue: {:?}", e),
            continue
        );

        info!("Found {} functions", function_ids.len());

        // zip functions [ (<address1>,<function1>), (<address2>,<functions2>)... ]
        let functions = function_ids.iter().zip(function_data.iter());

        // hash map of function_id to function
        let mut function_map = HashMap::<Address, SbFunction>::new();

        // assign the function to the function map
        for (function_id, function) in functions {
            let function = function.clone();
            let function_id = function_id.clone();
            function_map.insert(function_id, function);
        }
        // println!("FN_MAP: {:#?}", function_map);

        //=====================================================================
        // Fetch Function Requests
        //=====================================================================

        // Fetch all function requests
        let (request_ids, requests) = handle_or!(
            contract.get_active_requests_by_queue(queue_id).call().await,
            |e| println!("Error getting active functions on queue: {:?}", e),
            continue
        );

        // zip functions [ (<address1>,<request1>), (<address2>,<request2>)... ]
        let function_requests = request_ids.iter().zip(requests.iter());
        info!("Found {} function requests", function_requests.len());

        // get map of request.function_id to (request_id, request)
        let mut request_map = HashMap::<Address, Vec<(Address, Request)>>::new();
        for (request_id, req) in function_requests {
            let req = req.clone();
            let request_id = request_id.clone();
            let function_id = req.function_id.clone();
            let req_vec = request_map.get(&function_id);
            if req_vec.is_none() {
                request_map.insert(function_id, vec![(request_id, req)]);
            } else {
                let mut req_vec = req_vec.unwrap().clone();
                req_vec.push((request_id, req));
                request_map.insert(function_id, req_vec);
            }
        }

        //=====================================================================
        // Prepare Scheduled Function Calls
        //=====================================================================

        // Fetch all function requests
        let active_routines = contract.get_active_routines_by_queue(queue_id).call().await;

        // Don't panic because this could have not been deployed yet on the current network
        let (routine_ids, routines) = active_routines.unwrap_or_default();

        // filter function requests to just calls that should be run now (based on schedule at routine.schedule)
        let now = Utc::now();

        // zip routines [ (<address1>,<routine1>), (<address2>,<routine2>)... ]
        let ready_routines = routine_ids
            .iter()
            .zip(routines.iter())
            .filter(|(_, routine)| routine_is_ready(routine, now))
            .collect::<Vec<_>>();

        // get map of function_id to (routine_id, routine)
        let mut routine_map = HashMap::<Address, Vec<(Address, Routine)>>::new();
        for (routine_id, routine) in ready_routines.clone() {
            let routine = routine.clone();
            let routine_id = routine_id.clone();
            let function_id = routine.function_id.clone();
            let routine_vec = routine_map.get(&function_id);
            if routine_vec.is_none() {
                routine_map.insert(function_id, vec![(routine_id, routine)]);
            } else {
                let mut routine_vec = routine_vec.unwrap().clone();
                routine_vec.push((routine_id, routine));
                routine_map.insert(function_id, routine_vec);
            }
        }

        info!("Found {} routines", ready_routines.len());

        //=====================================================================
        // Routine Runs
        //=====================================================================

        // iterate through each of the function id vecs in function_requests_by_function_id
        for (function_id, function_routines) in routine_map {
            // println!("FUNCTION ID: {:?}, routines: {:?}", function_id, function_routines);
            // get function
            println!("FUNCTION ID: {:?}, routines: {:?}", function_id, function_routines);
            let function = handle_or!(
                function_map.get(&function_id).ok_or(""),
                |_| println!("Function not found"),
                continue
            );

            // check if it's the primary node assigned
            let is_primary_assigned =
                queue_data[function.state.queue_idx.as_usize() % queue_data.len()] == verifier_id;
            let is_secondary_assigned =
                queue_data[queue_fields.curr_idx.as_usize() % queue_data.len()] == verifier_id;

            // check if this node should steal execution
            let current_time = u64::try_from(now.timestamp()).unwrap();
            let next_allowed_timestamp = function.state.next_allowed_timestamp.as_u64();
            let staleness = current_time.saturating_sub(next_allowed_timestamp);

            // check if backup node should steal execution
            let should_steal_execution = is_secondary_assigned
                && staleness > u64::try_from(half_minute.num_seconds()).unwrap();

            // We want to run all function calls that are assigned to this node
            if is_primary_assigned || should_steal_execution {
                println!("RUNNING");
                // get container name
                let container_name = function.config.container.clone();
                let container_name = if !container_name.contains(":") {
                    format!("{}:{}", function.config.container.clone(), "latest")
                } else {
                    container_name
                };

                // get params for function that the function call can respond to
                let params: Vec<String> = function_routines
                    .iter()
                    .map(|(_, routine)| {
                        let params = routine.params.clone();
                        base64::encode(params)
                    })
                    .collect::<Vec<String>>();

                // get routine_ids for function that the function call can respond to
                let routine_ids = function_routines
                    .iter()
                    .map(|(routine_id, _)| format!("{:?}", routine_id))
                    .collect::<Vec<String>>();

                let fn_key = function_id.clone();

                let runner_ctx = ContainerRunnerCtx {
                    name: container_name,
                    fn_key: format!("{:?}", fn_key),
                    encoded_fn: String::default(),
                    fn_request_keys: routine_ids,
                    encoded_fn_reqs: params,
                    verifier_signer: format!("{:?}", verifier_data.signer),
                    queue_authority: format!("{:?}", queue_fields.authority),
                };

                runner_channel.send(runner_ctx).unwrap();
            } else {
                println!("Not assigned {} {}", queue_data[function.state.queue_idx.as_usize() % queue_data.len()], verifier_id);
            }
        }

        //=====================================================================
        // Request Runs
        //=====================================================================
        // iterate through each of the function id vecs in function_requests_by_function_id
        for (function_id, function_requests) in request_map {
            println!("FUNCTION ID: {:?}, reqs: {:?}", function_id, function_requests);
            // get function
            let function = handle_or!(
                function_map.get(&function_id).ok_or(""),
                |_| println!("Function not found"),
                continue
            );

            // check if it's the primary node assigned
            let is_primary_assigned =
                queue_data[function.state.queue_idx.as_usize() % queue_data.len()] == verifier_id;
            let is_secondary_assigned =
                queue_data[queue_fields.curr_idx.as_usize() % queue_data.len()] == verifier_id;

            // check if this node should steal execution
            let current_time = u64::try_from(now.timestamp()).unwrap();
            let next_allowed_timestamp = function.state.next_allowed_timestamp.as_u64();
            let staleness = current_time.saturating_sub(next_allowed_timestamp);

            // check if backup node should steal execution
            let should_steal_execution = is_secondary_assigned
                && staleness > u64::try_from(half_minute.num_seconds()).unwrap();

            // We want to run all function calls that are assigned to this node
            if is_primary_assigned || should_steal_execution {
                // get container name
                let container_name = function.config.container.clone();
                let container_name = if !container_name.contains(":") {
                    format!("{}:{}", function.config.container.clone(), "latest")
                } else {
                    container_name
                };

                // get params for function that the function call can respond to
                let params: Vec<String> = function_requests
                    .iter()
                    .map(|(_, req)| {
                        let params = req.request_data.clone();
                        base64::encode(params)
                    })
                    .collect::<Vec<String>>();

                // get routine_ids for function that the function call can respond to
                let request_ids = function_requests
                    .iter()
                    .map(|(request_id, _)| format!("{:?}", request_id))
                    .collect::<Vec<String>>();

                let fn_key = function_id.clone();

                let runner_ctx = ContainerRunnerCtx {
                    name: container_name,
                    fn_key: format!("{:?}", fn_key),
                    encoded_fn: String::default(),
                    fn_request_keys: request_ids,
                    encoded_fn_reqs: params,
                    verifier_signer: format!("{:?}", verifier_data.signer),
                    queue_authority: format!("{:?}", queue_fields.authority),
                };

                runner_channel.send(runner_ctx).unwrap();
            }
        }

        interval.tick().await;
    }
}
