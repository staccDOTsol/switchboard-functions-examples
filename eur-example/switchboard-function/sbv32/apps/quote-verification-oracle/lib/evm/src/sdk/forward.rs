use crate::*;
use ethers::{
    contract::builders::ContractCall,
    core::{
        k256::ecdsa::SigningKey,
        types::{Address, Bytes, H256, U256},
    },
    middleware::SignerMiddleware,
    providers::{JsonRpcClient, Provider},
    signers::Wallet,
};
use std::result::Result;

type EVMMiddleware<T> = SignerMiddleware<Provider<T>, Wallet<SigningKey>>;
type EVMContract<T> = Switchboard<EVMMiddleware<T>>;

pub fn forward<T: JsonRpcClient>(
    contract: EVMContract<T>,
    enclave_wallet: Wallet<SigningKey>,
    enclave_wallet_address: Address,
    calls: Vec<ContractCall<EVMMiddleware<T>, ()>>,
    expiration_time_seconds: U256,
    gas_limit: U256,
) -> Result<ContractCall<EVMMiddleware<T>, ()>, Err> {
    let (transactions, signatures) = calls
        .iter()
        .map(|c| {
            let transaction = switchboard::Transaction {
                expiration_time_seconds,
                gas_limit,
                value: U256::from(0),
                to: contract.address(),
                from: c.tx.from().unwrap().clone(),
                data: c.tx.data().unwrap().clone(),
            };

            let tx = eip712::Transaction::from(&transaction);
            let eip712_hash = eip712::get_transaction_hash(
                "Switchboard".to_string(),
                "0.0.1".to_string(),
                Env::get().CHAIN_ID.clone(),
                contract.address(),
                tx,
            )
            .unwrap();

            let is_enclave_wallet_signer = transaction.from == enclave_wallet_address;

            let signer = if is_enclave_wallet_signer {
                enclave_wallet.clone()
            } else {
                contract.client().signer().clone()
            };

            let _result = signer.sign_hash(H256::from(eip712_hash));

            (
                transaction,
                signer
                    .sign_hash(H256::from(eip712_hash))
                    .unwrap()
                    .to_vec()
                    .try_into()
                    .unwrap(),
            )
        })
        .unzip();

    // get function call
    Ok(contract.forward(transactions, signatures))
}

// explicitly set "from"
pub fn forward_with_sender<T: JsonRpcClient>(
    contract: EVMContract<T>,
    enclave_wallet: Wallet<SigningKey>,
    enclave_wallet_address: Address,
    calls: Vec<ContractCall<EVMMiddleware<T>, ()>>,
    expiration_time_seconds: U256,
    gas_limit: U256,
    sender: Address,
) -> Result<ContractCall<EVMMiddleware<T>, ()>, Err> {
    let (transactions, signatures) = calls
        .iter()
        .map(|c| {
            let transaction = switchboard::Transaction {
                expiration_time_seconds,
                gas_limit,
                value: U256::from(0),
                to: contract.address(),
                from: sender, // override sender
                data: c.tx.data().unwrap().clone(),
            };

            let tx = eip712::Transaction::from(&transaction);
            let eip712_hash = eip712::get_transaction_hash(
                "Switchboard".to_string(),
                "0.0.1".to_string(),
                Env::get().CHAIN_ID.clone(),
                contract.address(),
                tx,
            )
            .unwrap();

            let is_enclave_wallet_signer = transaction.from == enclave_wallet_address;

            let signer = if is_enclave_wallet_signer {
                enclave_wallet.clone()
            } else {
                contract.client().signer().clone()
            };

            (
                transaction,
                Bytes::from(signer.sign_hash(H256::from(eip712_hash)).unwrap().to_vec()),
            )
        })
        .unzip();

    // get function call
    Ok(contract.forward(transactions, signatures))
}
