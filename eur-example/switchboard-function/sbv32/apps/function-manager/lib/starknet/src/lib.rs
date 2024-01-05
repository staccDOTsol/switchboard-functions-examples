// pub use bollard;
//
// pub mod routines;
// use bollard::Docker;
// pub use routines::*;
// use std::result::Result;
// use std::sync::Arc;
// use url::Url;
// use starknet::{
    // accounts::{Call as NativeCall, ExecutionEncoding, SingleOwnerAccount},
    // core::types::{BlockId, BlockTag, EventFilter, FieldElement},
    // core::utils::starknet_keccak,
    // macros::{abigen, felt},
    // providers::{jsonrpc::HttpTransport, JsonRpcClient, Provider, SequencerGatewayProvider},
    // signers::{LocalWallet, Signer, SigningKey},
// };
// use tokio::runtime::Builder;
// #[path = "../../../src/qvn/mod.rs"]
// pub mod qvn;
// // pub mod sdk;
// pub use qvn::*;
//
// #[path = "../../../src/env/mod.rs"]
// pub mod env;
// pub use env::*;
//
// #[path = "../../../src/error.rs"]
// pub mod error;
// pub use error::*;
//
// #[path = "../../../src/docker_utils/mod.rs"]
// pub mod docker_utils;
// pub use docker_utils::*;
//
// #[path = "../../../src/metrics/mod.rs"]
// pub mod metrics;
// use metrics::*;
//
// pub mod sdk;
// pub use sdk::*;

#[no_mangle]
pub extern "C" fn starknet_start() {
    // let rt = Builder::new_multi_thread()
        // .worker_threads(25)
        // .enable_all()
        // .build()
        // .unwrap();
    // rt.block_on(async move {
        // start().await.unwrap();
    // });
}

// pub async fn start() -> Result<(), Err> {
    // let _docker = Docker::connect_with_unix_defaults().unwrap();
//
    // // // @TODO: ADD THESE ENV VARS
    // let contract_address = &Env::get().CONTRACT_ADDRESS;
    // let chain_id: u64 = Env::get().CHAIN_ID;
//
    // // // get EVM payer
    // let payer = &Env::get().PAYER_SECRET;
    // let enclave_key = &Env::get().QUOTE_KEY.parse::<FieldElement>().unwrap();
//
    // // // grab rpc url
    // let rpc_url = &Env::get().RPC_URL;
    // let feeder_url = &Env::get().FEEDER_RPC_URL;
//
    // let contract_address: FieldElement = contract_address.parse::<FieldElement>().unwrap();
    // // // setup provider + signer
    // let rpc_url = Url::parse(rpc_url).unwrap();
    // // let feeder_url = Url::parse(feeder_url).unwrap();
    // // let provider = Arc::new(SequencerGatewayProvider::new(rpc_url,feeder_url,FieldElement::from(chain_id)));
    // let provider = JsonRpcClient::new(HttpTransport::new(rpc_url.clone()));
    // // let provider = Provider::<Http>::try_from(url).unwrap();
    // let signing_key = SigningKey::from_secret_scalar(FieldElement::from_hex_be(payer).unwrap());
    // let payer = LocalWallet::from_signing_key(signing_key).unwrap();
    // // let payer = payer.with_chain_id(chain_id);
    // // let payer_client = SignerMiddleware::new(provider.clone(), payer.clone());
//
    // // // set up payer contract for node initialization and permissions
    // let payer_contract = SwitchboardReader::new(contract_address,&provider);
//
    // // // set QUEUE if not already set
    // if std::env::var("QUEUE").is_err() {
        // let verifier_data = payer_contract.get_verifier(enclave_key).await.unwrap();
        // let queue = format!("{:#?}", verifier_data.queue_id);
        // std::env::set_var("QUEUE", queue);
    // }
//
    // let qvn = Arc::new(Qvn::new().await);
//
    // // let qvn_watcher = qvn.clone().watch(docker.clone());
    // let fn_watcher = tokio::spawn(async move {
        // function_check_routine(&docker, payer_contract, &qvn).await;
    // });
    // // qvn_watcher.await.unwrap();
    // fn_watcher.await.unwrap();
//
    // Ok(())
// }
//
