use crate::*;

use ethers::prelude::*;
use ethers::{
    core::{k256::ecdsa::SigningKey, types::Address},
    middleware::SignerMiddleware,
    providers::{Http, Middleware, Provider},
    signers::Wallet,
};
use sdk::switchboard::Switchboard;
use std::time::{Duration, SystemTime};
use tokio::time::{interval, Interval};
use ethers::abi::AbiDecode;
use ethers::prelude::ContractError::Revert;
type EVMContract = Switchboard<SignerMiddleware<Provider<Http>, Wallet<SigningKey>>>;

pub async fn heartbeat_routine(
    contract: EVMContract,
    enclave_wallet: Wallet<SigningKey>,
    node_address: Address,
) {
    let mut interval: Interval = interval(Duration::from_secs(120));
    loop {
        let heartbeat = contract.enclave_heartbeat(node_address);

        let client = contract.client();

        let balance = client
            .provider()
            .get_balance(client.address(), None)
            .await
            .unwrap();

        // set expiration time to 30 seconds from now
        let timeout_time = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap_or(Duration::ZERO)
            .as_secs()
            + 30;

        let enclave_address = enclave_wallet.address();

        // metatx within a metatx
        let heartbeat = vec![heartbeat];

        // send off function tx
        let heartbeat_tx_resp = forward_with_sender(
            contract.clone(),
            enclave_wallet.clone(),           // this enclave wallet
            enclave_address.clone(),          // the address corresponding to the enclave wallet
            heartbeat, // metatransactions (1 for the heartbeat call, which itself can forward many more)
            timeout_time.try_into().unwrap(), // time in 30 seconds
            balance,   // @TODO: gas limit max  - maybe fix this so it's not the whole balance
            enclave_address, // make sure that this sender is marked as 'from' for every transaction
        )
        .unwrap();

        let heartbeat_tx_resp = heartbeat_tx_resp.send().await;

        if let Ok(heartbeat_tx) = heartbeat_tx_resp {
            match heartbeat_tx.await {
                Ok(tx) => {
                    let enclave = contract
                        .enclaves(node_address)
                        .call()
                        .await
                        .unwrap_or_default();

                    if let Some(transaction_receipt) = tx {
                        println!("Heartbeat tx: {:?}", transaction_receipt.transaction_hash);
                    }

                    println!("Quote Status: {:#?}", enclave.verification_status);
                }
                Err(e) => {
                    eprintln!("Error awaiting heartbeat transaction: {}", e);
                }
            }
        } else if let Err(e) = heartbeat_tx_resp {
            println!("Heartbeat tx: {:?}", e);
            if let Revert(bytes) = e {
                let abi_err = SwitchboardErrors::decode(&bytes);
                println!("{:?}", abi_err);
                println!("node_address {:?}", node_address.clone());
                println!("encalve_wallet {:?}", enclave_address.clone());
                println!("client_wallet {:?}", client.address().clone());
                let enclave = contract
                    .enclaves(node_address)
                    .call()
                    .await
                    .unwrap_or_default();
                println!("enclave {:?}", enclave);
            }
        }

        interval.tick().await;
    }
}
