use futures;
use lazy_static::lazy_static;
use serde::Deserialize;
use std::fs;

lazy_static! {
    static ref ENV: Env = futures::executor::block_on(Env::new());
}

fn default_heartbeat_interval() -> i64 {
    30
}
fn default_mode() -> String {
    "default".to_string()
}

fn read_and_trim_file(file_path: &str) -> Result<String, Box<dyn std::error::Error>> {
    // Check if the file exists
    if !std::path::Path::new(file_path).exists() {
        return Err(Box::new(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("File not found: {}", file_path),
        )));
    }

    // Read the file to a String
    let content = fs::read_to_string(file_path)?;

    // Trim the content and return it
    Ok(content.trim().to_string())
}

#[derive(Deserialize, Default)]
#[serde(default)]
pub struct QvnEnvironment {
    pub chain: String,
    pub chain_id: String, // will convert to u64 basedon CHAIN
    pub quote_key: String,
    pub rpc_url: String,
    // BUG: This variable will never get populated
    pub wss_url: String,
    pub wss_rpc_url: String,
    #[serde(default = "default_heartbeat_interval")]
    pub heartbeat_interval: i64,

    #[serde(default = "default_mode")]
    pub mode: String,

    // Required to post a quote for verification
    pub ipfs_url: String,
    pub ipfs_key: String,
    pub ipfs_secret: String,

    pub queue: Option<String>,

    // One of the keypair configs required
    pub payer_secret: Option<String>,
    pub fs_payer_secret_path: Option<String>,
    pub google_payer_secret_path: Option<String>,
    pub google_application_credentials: Option<String>,

    // EVM
    pub contract_address: Option<String>,
    pub funding_threshold: Option<String>,
    pub funding_amount: Option<String>,

    // Starknet
    pub payer_account: Option<String>,
}
impl QvnEnvironment {
    pub fn parse() -> Result<Self, envy::Error> {
        envy::from_env::<QvnEnvironment>()
    }

    pub fn get_payer(&self) -> Result<String, Box<dyn std::error::Error>> {
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

        Ok(String::new())
    }
}

#[allow(non_snake_case)]
#[derive(Default, Clone)]
pub struct Env {
    pub MODE: String,
    pub GOOGLE_PAYER_SECRET_PATH: String,
    pub CHAIN: String,
    pub RPC_URL: String,
    pub WSS_URL: String,
    pub QUEUE: String,
    pub CHAIN_ID: u64,
    pub CONTRACT_ADDRESS: String,
    pub PAYER_ACCOUNT: String,
    pub FUNDING_THRESHOLD: String,
    pub FUNDING_AMOUNT: String,
    pub IPFS_URL: String,
    pub IPFS_KEY: String,
    pub IPFS_SECRET: String,
    pub QUOTE_KEY: String,
    pub HEARTBEAT_INTERVAL: i64,
    // Derived
    pub PAYER_SECRET: String,
}

impl Env {
    pub async fn new() -> Self {
        let env = QvnEnvironment::parse().unwrap();

        let chain_id = match env.chain.as_str() {
            "evm" => env.chain_id.as_str().parse::<u64>().unwrap_or_default(),
            _ => 0,
        };

        // println!("{:#?}", env);

        Self {
            MODE: env.mode,
            CHAIN: env.chain,
            GOOGLE_PAYER_SECRET_PATH: env.google_payer_secret_path.unwrap_or(String::new()),
            RPC_URL: env.rpc_url,
            QUEUE: env.queue.unwrap_or(String::new()),
            PAYER_SECRET: env.payer_secret.clone().unwrap_or(String::new()),
            CHAIN_ID: chain_id,
            CONTRACT_ADDRESS: env.contract_address.unwrap_or(String::new()),
            PAYER_ACCOUNT: env.payer_account.unwrap_or(String::new()),
            FUNDING_THRESHOLD: env.funding_threshold.unwrap_or(String::new()),
            FUNDING_AMOUNT: env.funding_amount.unwrap_or(String::new()),
            WSS_URL: env.wss_rpc_url,
            IPFS_URL: env.ipfs_url,
            IPFS_KEY: env.ipfs_key,
            IPFS_SECRET: env.ipfs_secret,
            QUOTE_KEY: env.quote_key,
            HEARTBEAT_INTERVAL: env.heartbeat_interval,
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
        write!(f, "WSS_URL:                  {}\n", self.WSS_URL)?;
        write!(f, "CHAIN:                    {}\n", self.CHAIN)?;
        if self.QUEUE.len() != 0 {
            write!(f, "QUEUE:                    {}\n", self.QUEUE)?;
        }
        write!(f, "QUOTE:                    {}\n", self.QUOTE_KEY)?;
        write!(
            f,
            "GOOGLE_PAYER_SECRET_PATH: {}\n",
            self.GOOGLE_PAYER_SECRET_PATH
        )?;
        write!(f, "CONTRACT_ADDRESS:         {}\n", self.CONTRACT_ADDRESS)?;
        write!(f, "PAYER_ACCOUNT:         {}\n", self.PAYER_ACCOUNT)?;
        write!(f, "CHAIN_ID:                 {}\n", self.CHAIN_ID)?;
        write!(f, "FUNDING_THRESHOLD:        {}\n", self.FUNDING_THRESHOLD)?;
        write!(f, "FUNDING_AMOUNT:           {}\n", self.FUNDING_AMOUNT)?;
        write!(f, "=========================\n")?;
        Ok(())
    }
}
