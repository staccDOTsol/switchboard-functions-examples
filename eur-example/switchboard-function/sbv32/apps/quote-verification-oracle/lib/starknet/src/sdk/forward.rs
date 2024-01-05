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

// type EVMMiddleware<T> = SignerMiddleware<Provider<T>, Wallet<SigningKey>>;
// type EVMContract<T> = Switchboard<EVMMiddleware<T>>;

use starknet::{
    accounts::{ExecutionEncoding, SingleOwnerAccount},
    core::types::{BlockId, BlockTag, EventFilter, FieldElement},
    core::utils::starknet_keccak,
    macros::{abigen, felt},
    providers::{jsonrpc::HttpTransport, JsonRpcClient, Provider},
    signers::{LocalWallet, SigningKey},
};
use starknet::{core::types::FunctionCall, macros::selector, providers::SequencerGatewayProvider};
use tokio::time::{interval, Interval};
// abigen!(
//     Switchboard,
//     "../../../../../function-manager/lib/starknet/abi.json"
// );
use sdk::switchboard::SwitchboardContract as Switchboard;
use starknet_crypto::poseidon_hash_many;
pub fn forward<T: JsonRpcClient>(
    contract: Switchboard<SequencerGatewayProvider>,
    enclave_wallet: LocalWallet,
    enclave_wallet_address: FieldElement,
    fn_id: FieldElement,
    // calls: Vec<ContractCall<EVMMiddleware<T>, ()>>,
    // expiration_time_seconds: U256,
    // gas_limit: U256,
) -> Result<(), Err> {
    let transactions: Vec<Call> = calls
        .iter()
        .map(|c| {
            // let transaction = switchboard::Transaction {
            //     expiration_time_seconds,
            //     gas_limit,
            //     value: U256::from(0),
            //     to: contract.address(),
            //     from: c.tx.from().unwrap().clone(),
            //     data: c.tx.data().unwrap().clone(),
            // };

            //let tx = eip712::Transaction::from(&transaction);
            // let eip712_hash = eip712::get_transaction_hash(
            //     "Switchboard".to_string(),
            //     "0.0.1".to_string(),
            //     Env::get().CHAIN_ID.clone(),
            //     contract.address(),
            //     tx,
            // )
            // .unwrap();
            let mut transaction = Call {
                data: CallData {
                    to: contract.address,
                    selector: String::from("function_verify"),
                    calldata: vec![],
                },
                signature: FieldElement::default(),
            };
            let is_enclave_wallet_signer = transaction.from == enclave_wallet_address;

            let signer = if is_enclave_wallet_signer {
                enclave_wallet
            } else {
                enclave_wallet
                //contract.client().signer().clone()
            };

            // let _result = signer.sign_hash(H256::from(eip712_hash));
            let to = FieldElement::from_byte_slice_be(transaction.data.to.to_bytes_be().as_ref())
                .unwrap();
            let selector =
                FieldElement::from_byte_slice_be(transaction.data.selector.to_bytes_be().as_ref())
                    .unwrap();
            let calldata =
                FieldElement::from_byte_slice_be(transaction.data.calldata.to_bytes_be().as_ref())
                    .unwrap();

            let call_hash = poseidon_hash_many(vec![to, selector, calldata].as_slice()).unwrap();
            let signature = signer.sign_hash(&call_hash).await.unwrap();
            // transaction.
            // signer
            //     .sign_hash(H256::from(eip712_hash))
            //     .unwrap()
            //     .to_vec()
            //     .try_into()
            //     .unwrap();

            transaction.signature = signature;
            transaction
        })
        .collect();

    let params = FunctionForwardParams {
        fn_id,
        transactions,
    };
    // get function call
    contract.function_forward(params);
    Ok(())
}

#[derive(Default, Clone)]
pub struct FunctionForwardParams {
    fn_id: FieldElement,
    transactions: Vec<Call>,
}

// explicitly set "from"
// pub fn forward_with_sender<T: JsonRpcClient>(
//     contract: EVMContract<T>,
//     enclave_wallet: Wallet<SigningKey>,
//     enclave_wallet_address: Address,
//     calls: Vec<ContractCall<EVMMiddleware<T>, ()>>,
//     expiration_time_seconds: U256,
//     gas_limit: U256,
//     sender: Address,
// ) -> Result<ContractCall<EVMMiddleware<T>, ()>, Err> {
//     let (transactions, signatures) = calls
//         .iter()
//         .map(|c| {
//             let transaction = switchboard::Transaction {
//                 expiration_time_seconds,
//                 gas_limit,
//                 value: U256::from(0),
//                 to: contract.address(),
//                 from: sender, // override sender
//                 data: c.tx.data().unwrap().clone(),
//             };
//
//             let tx = eip712::Transaction::from(&transaction);
//             let eip712_hash = eip712::get_transaction_hash(
//                 "Switchboard".to_string(),
//                 "0.0.1".to_string(),
//                 Env::get().CHAIN_ID.clone(),
//                 contract.address(),
//                 tx,
//             )
//             .unwrap();
//
//             let is_enclave_wallet_signer = transaction.from == enclave_wallet_address;
//
//             let signer = if is_enclave_wallet_signer {
//                 enclave_wallet.clone()
//             } else {
//                 contract.client().signer().clone()
//             };
//
//             (
//                 transaction,
//                 Bytes::from(signer.sign_hash(H256::from(eip712_hash)).unwrap().to_vec()),
//             )
//         })
//         .unzip();
//
//     // get function call
//     Ok(contract.forward(transactions, signatures))
// }
