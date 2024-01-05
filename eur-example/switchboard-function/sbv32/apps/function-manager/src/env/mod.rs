use futures;
use lazy_static::lazy_static;
use serde::Deserialize;
use std::{fs, sync::Arc};
use switchboard_common::SbError;

#[link(name = "gcp")]
extern "C" {
    fn gsm_get_secret(fqn: *const u8, fqn_len: usize, rout: *mut u8, out_len: *mut usize);
}

lazy_static! {
    static ref ENV: Env = futures::executor::block_on(Env::new());
}

fn default_heartbeat_interval() -> i64 {
    30
}

fn read_and_trim_file(file_path: &str) -> Result<String, SbError> {
    // Check if the file exists
    if !std::path::Path::new(file_path).exists() {
        return Err(SbError::CustomError {
            message: "File not found".to_string(),
            source: Arc::new(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                format!("File not found: {}", file_path),
            )),
        });
    }

    // Read the file to a String
    let content = fs::read_to_string(file_path).map_err(|e| SbError::CustomError {
        message: "Failed to read file".to_string(),
        source: Arc::new(e),
    })?;

    // Trim the content and return it
    Ok(content.trim().to_string())
}

#[derive(Deserialize, Debug, Default)]
#[serde(default)]
pub struct FunctionManagerEnvironment {
    pub chain: String,
    pub chain_id: String, // will convert to u64 basedon CHAIN
    pub cluster: Option<String>,
    pub quote_key: String,
    pub rpc_url: String,
    pub wss_url: Option<String>,
    pub qvn_url: Option<String>,
    #[serde(default = "default_heartbeat_interval")]
    pub heartbeat_interval: i64,
    pub num_workers: Option<u32>,
    pub container_timeout: Option<u32>,

    // Required to post a quote for verification
    pub ipfs_url: String,
    pub ipfs_key: String,
    pub ipfs_secret: String,

    pub queue: Option<String>,

    pub debug: Option<u8>,

    // One of the keypair configs required
    pub payer_secret: Option<String>,
    pub fs_payer_secret_path: Option<String>,
    pub google_payer_secret_path: Option<String>,
    pub google_application_credentials: Option<String>,

    // Does this do anything? We never fetch from private repos
    pub docker_user: Option<String>,
    pub docker_key: Option<String>,

    // EVM
    pub contract_address: Option<String>,
}
impl FunctionManagerEnvironment {
    pub fn parse() -> Result<Self, SbError> {
        match envy::from_env::<FunctionManagerEnvironment>() {
            Ok(env) => Ok(env),
            Err(error) => Err(SbError::CustomMessage(format!(
                "failed to decode environment variables: {}",
                error
            ))),
        }
    }

    /// Gets the payer secret from the provided environment variables
    /// 1. PAYER_SECRET
    /// 2. FS_PAYER_SECRET_PATH
    /// 3. GOOGLE_PAYER_SECRET_PATH
    /// 4. FS Injection '/pod-data/out'
    pub fn get_payer(&self) -> Result<String, SbError> {
        // Check if PAYER_SECRET was provided
        if self.payer_secret.as_ref().is_some_and(|v| !v.is_empty()) {
            return Ok(self
                .payer_secret
                .as_ref()
                .unwrap()
                .clone()
                .trim()
                .to_string());
        }

        if self
            .fs_payer_secret_path
            .as_ref()
            .is_some_and(|v| !v.is_empty())
        {
            return read_and_trim_file(self.fs_payer_secret_path.as_ref().unwrap());
        }

        if self
            .google_payer_secret_path
            .as_ref()
            .is_some_and(|v| !v.is_empty())
        {
            let google_payer_secret_path = self.google_payer_secret_path.as_ref().unwrap();
            let mut buf = [0; 512];
            let mut payer_len: usize = buf.len();

            unsafe {
                gsm_get_secret(
                    google_payer_secret_path.as_ptr(),
                    google_payer_secret_path.len(),
                    buf.as_mut_ptr(),
                    &mut payer_len,
                )
            };
            return Ok(ptr_to_string(buf.as_ptr(), payer_len));
        }

        Ok(fs::read_to_string("/pod-data/out")
            .expect("Error reading fs secret")
            .trim()
            .to_string())

        // Err(Error::CustomMessage(
        //     "Failed to yield payer secret from provided ENV variables".to_string(),
        // ))
    }
}
#[allow(non_snake_case)]
#[derive(Default, Clone)]
pub struct Env {
    pub GOOGLE_PAYER_SECRET_PATH: String,
    pub GOOGLE_APPLICATION_CREDENTIALS: String,
    pub CHAIN: String,
    pub RPC_URL: String,
    pub QVN_URL: String,
    pub QUEUE: String,
    pub DOCKER_USER: String,
    pub DOCKER_KEY: String,
    pub IPFS_URL: String,
    pub IPFS_KEY: String,
    pub IPFS_SECRET: String,
    pub QUOTE_KEY: String,
    pub CLUSTER: String,
    pub HEARTBEAT_INTERVAL: i64,
    pub DEBUG: u8,
    pub LOCAL_QVN: bool,
    pub NUM_WORKERS: u32,
    pub CONTAINER_TIMEOUT: u32,
    // Derived
    pub WSS_URL: String,
    pub PAYER_SECRET: String,
    // EVM
    pub CONTRACT_ADDRESS: String,
    pub CHAIN_ID: u64,
}

fn ptr_to_string(ptr: *const u8, len: usize) -> String {
    unsafe { std::str::from_utf8_unchecked(std::slice::from_raw_parts(ptr, len)).to_owned() }
}

impl Env {
    async fn new() -> Self {
        let env = FunctionManagerEnvironment::parse().unwrap();
        let wss_url = if env.wss_url.as_ref().is_none() {
            env.rpc_url.replace("https://", "wss://")
        } else {
            env.wss_url.as_ref().unwrap().clone()
        };

        let payer_secret = env.get_payer().unwrap();

        let (cluster, chain_id) = match env.chain.as_str() {
            "solana" => (env.cluster.unwrap(), 0),
            "evm" => (
                "".to_string(),
                env.chain_id.as_str().parse::<u64>().unwrap_or_default(),
            ),
            _ => ("".to_string(), 0),
        };
        let local_qvn: u8 = std::env::var("LOCAL_QVN")
            .unwrap_or("0".into())
            .parse()
            .unwrap_or_default();

        Self {
            CHAIN: env.chain,
            GOOGLE_PAYER_SECRET_PATH: env.google_payer_secret_path.unwrap_or(String::new()),
            GOOGLE_APPLICATION_CREDENTIALS: env
                .google_application_credentials
                .unwrap_or(String::new()),
            RPC_URL: env.rpc_url,
            QVN_URL: env.qvn_url.unwrap_or_default(),
            WSS_URL: wss_url.clone(),
            QUEUE: env.queue.unwrap_or(String::new()),
            PAYER_SECRET: payer_secret,
            DOCKER_USER: env.docker_user.unwrap(),
            DOCKER_KEY: env.docker_key.unwrap(),
            IPFS_URL: env.ipfs_url,
            IPFS_KEY: env.ipfs_key,
            IPFS_SECRET: env.ipfs_secret,
            QUOTE_KEY: env.quote_key,
            CONTRACT_ADDRESS: env.contract_address.unwrap_or(String::new()),
            CHAIN_ID: chain_id,
            CLUSTER: cluster,
            HEARTBEAT_INTERVAL: env.heartbeat_interval,
            DEBUG: env.debug.unwrap_or(0),
            LOCAL_QVN: local_qvn != 0,
            NUM_WORKERS: env.num_workers.unwrap_or(12),
            CONTAINER_TIMEOUT: env.container_timeout.unwrap_or(30),
        }
    }

    pub fn get() -> &'static Self {
        &ENV
    }
}

impl std::fmt::Display for Env {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "=====Node Environment=====\n")?;
        write!(f, "RPC_URL:                  {}\n", self.RPC_URL)?;
        write!(f, "CHAIN:                    {}\n", self.CHAIN)?;
        write!(f, "QUEUE:                    {}\n", self.QUEUE)?;
        write!(f, "QUOTE:                    {}\n", self.QUOTE_KEY)?;
        write!(
            f,
            "GOOGLE_PAYER_SECRET_PATH: {}\n",
            self.GOOGLE_PAYER_SECRET_PATH
        )?;
        write!(f, "CONTRACT_ADDRESS:         {}\n", self.CONTRACT_ADDRESS)?;
        write!(f, "CHAIN_ID:                 {}\n", self.CHAIN_ID)?;
        write!(f, "WSS_URL:                  {}\n", self.WSS_URL)?;
        write!(f, "NUM_WORKERS:              {}\n", self.NUM_WORKERS)?;
        write!(f, "==========================\n")?;
        Ok(())
    }
}
impl std::fmt::Debug for Env {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "=====Node Environment=====\n")?;
        write!(f, "RPC_URL:                  {}\n", self.RPC_URL)?;
        write!(f, "CHAIN:                    {}\n", self.CHAIN)?;
        write!(f, "QUEUE:                    {}\n", self.QUEUE)?;
        write!(f, "QUOTE:                    {}\n", self.QUOTE_KEY)?;
        write!(
            f,
            "GOOGLE_PAYER_SECRET_PATH: {}\n",
            self.GOOGLE_PAYER_SECRET_PATH
        )?;
        write!(f, "CONTRACT_ADDRESS:         {}\n", self.CONTRACT_ADDRESS)?;
        write!(f, "CHAIN_ID:                 {}\n", self.CHAIN_ID)?;
        write!(f, "WSS_URL:                  {}\n", self.WSS_URL)?;
        write!(f, "NUM_WORKERS:              {}\n", self.NUM_WORKERS)?;
        write!(f, "==========================\n")?;
        Ok(())
    }
}
