use async_channel::Receiver;
use dashmap::DashMap;
use serde::Deserialize;
use serde::Serialize;
use tokio::sync::mpsc::UnboundedSender;

use crate::*;

// !!! This module should have the most test coverage - caching issues suck.

/// Stores the context for the oracle inside a OnceCell so it is only ever
/// initialized once but available across threads. (A OnceCell might be overkill,
/// we might be better off just passing it to each routine in an Arc).
///
/// We will store all of the active functions, routines, and requests here so we
/// can access them from anywhere in the program. This will allow us to hook into
/// our data store for extra routines like container fetcher, balance watcher, etc.
///
/// # Parameters
/// * `active_containers` - the list of active containers running on the node
pub struct OracleContext {
    // config (env variables)
    /// The maximum number of containers that can run at once.
    // TODO: should this be handled by the docker container manager?
    pub max_active_containers: usize,
    /// The number of seconds to wait between fetching containers.
    // TODO: this probably only makes sense to do on the very first run and periodically for requests.
    // We dont want to fail routines because the fetch interval hasnt elapsed yet - bad UX.
    pub container_download_interval: i64,

    // data store
    pub active_containers: Arc<DashMap<String, i64>>,
    pub container_backoff: Arc<DashMap<String, i64>>,
}

fn capitalize_first(s: &str) -> String {
    let mut c = s.chars();
    match c.next() {
        None => String::new(),
        Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
    }
}

/// Represents a type of SwitchboardFunction to execute.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct SolanaJob {
    /// The name of the job to execute.
    pub name: String,
    /// The pubkey of the job to execute.
    pub pubkey: String,
    /// The hex encoded account data of the job to execute.
    pub encoded_account: String,
}

/// Represents a type of SwitchboardFunction to execute.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub enum SolanaContainerJob {
    Function,
    Routine(SolanaJob),
    Request(SolanaJob),
}

#[derive(Clone, Deserialize, Serialize, PartialEq, Eq, Hash)]
pub enum RequestType {
    Function,
    Routine,
    Request,
}
impl std::fmt::Debug for RequestType {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        match *self {
            RequestType::Function => write!(f, "function"),
            RequestType::Routine => write!(f, "routine"),
            RequestType::Request => write!(f, "request"),
        }
    }
}
impl std::fmt::Display for RequestType {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        match *self {
            RequestType::Function => write!(f, "function"),
            RequestType::Routine => write!(f, "routine"),
            RequestType::Request => write!(f, "request"),
        }
    }
}
impl log::kv::ToKey for RequestType {
    fn to_key(&self) -> log::kv::Key {
        match &self {
            RequestType::Function => log::kv::Key::from_str("function"),
            RequestType::Routine => log::kv::Key::from_str("routine"),
            RequestType::Request => log::kv::Key::from_str("request"),
        }
    }
}

/// The context for the SwitchboardFunction to execute.
#[derive(Clone, Debug)]
pub struct ContainerRunnerCtx {
    /// The name used for logging
    pub name: String,
    /// The slot used to fetch the data.
    pub slot: u64,

    // verifier config
    pub verifier_signer: String,
    pub queue_authority: String,

    // function config
    pub fn_key: String,
    pub encoded_fn: String,

    // the job to execute
    pub job: SolanaContainerJob,
}
impl ContainerRunnerCtx {
    pub fn parse(&self) -> (String, String, RequestType, String, String) {
        let name = self.name();
        let fn_key = self.fn_key();
        let request_type = self.request_type();
        let running_key = self.running_key();
        let id = if let RequestType::Function = &request_type {
            format!(
                "Function (container='{}', function='{}')",
                self.name.clone(),
                self.fn_key.clone()
            )
        } else {
            format!(
                "{} (container='{}', function='{}', {}='{}')",
                capitalize_first(request_type.to_string().as_str()),
                self.name.clone(),
                self.fn_key.clone(),
                request_type.clone(),
                running_key.clone()
            )
        };
        (name, fn_key, request_type, running_key, id)
    }
    pub fn name(&self) -> String {
        self.name.clone()
    }

    pub fn fn_key(&self) -> String {
        self.fn_key.clone()
    }

    pub fn request_type(&self) -> RequestType {
        match &self.job {
            SolanaContainerJob::Function => RequestType::Function,
            SolanaContainerJob::Routine(_) => RequestType::Routine,
            SolanaContainerJob::Request(_) => RequestType::Request,
        }
    }

    pub fn running_key(&self) -> String {
        match &self.job {
            SolanaContainerJob::Function => self.fn_key.clone(),
            SolanaContainerJob::Routine(job) => job.pubkey.clone(),
            SolanaContainerJob::Request(job) => job.pubkey.clone(),
        }
    }

    pub fn id(&self) -> String {
        let request_type = self.request_type();
        let running_key = self.running_key();
        if let RequestType::Function = &request_type {
            format!(
                "Function (container='{}', function='{}')",
                self.name.clone(),
                self.fn_key.clone()
            )
        } else {
            format!(
                "{} (container='{}', function='{}', {}='{}')",
                capitalize_first(request_type.to_string().as_str()),
                self.name.clone(),
                self.fn_key.clone(),
                request_type.clone(),
                running_key.clone()
            )
        }
    }

    pub fn to_env(&self, default_env: &[String]) -> Vec<String> {
        let env_variables = [
            default_env.to_vec(),
            vec![
                format!("MINIMUM_CONTEXT_SLOT={}", self.slot),
                format!("FUNCTION_KEY={}", self.fn_key.clone()),
                format!("FUNCTION_DATA={}", self.encoded_fn),
                format!("VERIFIER_ENCLAVE_SIGNER={}", self.verifier_signer),
                format!("QUEUE_AUTHORITY={}", self.queue_authority),
            ],
        ]
        .concat();

        match &self.job {
            SolanaContainerJob::Function => env_variables,
            SolanaContainerJob::Routine(job) => [
                env_variables,
                vec![
                    format!("FUNCTION_ROUTINE_KEY={}", job.pubkey),
                    format!("FUNCTION_ROUTINE_DATA={}", job.encoded_account),
                    format!("FUNCTION_REQUEST_KEY={}", String::new()),
                    format!("FUNCTION_REQUEST_DATA={}", String::new()),
                ],
            ]
            .concat(),
            SolanaContainerJob::Request(job) => [
                env_variables,
                vec![
                    format!("FUNCTION_ROUTINE_KEY={}", String::new()),
                    format!("FUNCTION_ROUTINE_DATA={}", String::new()),
                    format!("FUNCTION_REQUEST_KEY={}", job.pubkey),
                    format!("FUNCTION_REQUEST_DATA={}", job.encoded_account),
                ],
            ]
            .concat(),
        }
    }
}

#[derive(Clone)]
pub struct ContainerRunRoutineOptions {
    pub rx: Receiver<ContainerRunnerCtx>,
    pub container_downloader_chan: UnboundedSender<String>,
    // pub container_awaiter_chan:
    // UnboundedSender<tokio::task::JoinHandle<switchboard_solana::Result<(), SbError>>>,
    pub payer: String,
    pub reward_receiver: String,
    pub verifier: String,
    pub cluster: String,
}
