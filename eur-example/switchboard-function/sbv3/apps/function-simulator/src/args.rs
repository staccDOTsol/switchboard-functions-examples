pub use clap::Parser;
pub use kv_log_macro::{debug, error, info};

#[derive(Parser, Debug)]
pub struct Args {
    #[clap(env, default_value_t = 8080)]
    pub port: u32,
    #[clap(env, default_value = "https://api.mainnet-beta.solana.com")]
    pub solana_mainnet_rpc_url: String,
    #[clap(env, default_value = "https://api.devnet.solana.com")]
    pub solana_devnet_rpc_url: String,
}

impl Args {
    pub fn log(&self) {
        info!("PORT: {}", self.port, { id: "env" });
        info!("SOLANA_MAINNET_RPC: {}", self.solana_mainnet_rpc_url, { id: "env" });
        info!("SOLANA_DEVNET_RPC: {}", self.solana_devnet_rpc_url, { id: "env"});
    }
}
