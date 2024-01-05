use crate::*;
use chrono::DateTime;
use chrono::NaiveDateTime;
use chrono::Utc;
use cron::Schedule;
// use ethers::abi::AbiDecode;
// use ethers::prelude::ContractError::Revert;
// use ethers::signers::Signer;
// use ethers::types::H160;
// use ethers::{
//     contract::builders::ContractCall,
//     core::{
//         k256::ecdsa::SigningKey,
//         types::{Address, Bytes, U256},
//     },
//     middleware::SignerMiddleware,
//     providers::{JsonRpcClient, Middleware, Provider},
//     signers::Wallet,
// };
// use sdk::Switchboard;
use sgx_quote::Quote;
use sha2::{Digest, Sha256};
use std::ops::Div;
use std::result::Result;
use std::time::{Duration, SystemTime};
use switchboard_common::*;
use sdk::switchboard::Switchboard;
use starknet::FieldElement;
// type EVMMiddleware<T> = SignerMiddleware<Provider<T>, Wallet<SigningKey>>;
// type EVMContract<T> = Switchboard<EVMMiddleware<T>>;
//
// impl From<&EvmTransaction> for sdk::switchboard::Transaction {
//     fn from(tx: &EvmTransaction) -> Self {
//         sdk::switchboard::Transaction {
//             expiration_time_seconds: U256::from(tx.expiration_time_seconds),
//             gas_limit: U256::from_str_radix(&tx.gas_limit, 10).unwrap(),
//             value: U256::from_str_radix(&tx.value, 10).unwrap(),
//             to: Address::from_slice(tx.to.as_slice()),
//             from: Address::from_slice(tx.from.as_slice()),
//             data: Bytes::from(tx.data.clone()),
//         }
//     }
// }

use std::hash::Hash;
// pub struct StarknetTransaction {
//     /// The hash identifying the transaction
//     pub transaction_hash: FieldElement,
//     /// Sender address
//     pub sender_address: FieldElement,
//     /// The data expected by the account's `execute` function (in most usecases, this includes the
//     /// called contract address and a function selector)
//     pub calldata: Vec<FieldElement>,
//     /// The maximal fee that can be charged for including the transaction
//     pub max_fee: FieldElement,
//     /// Signature
//     pub signature: Vec<FieldElement>,
//     /// Nonce
//     pub nonce: FieldElement,
// }
use serde::Serialize;
use starknet::core::crypto::Signature;
#[derive(Debug, Clone, Hash, Default, Serialize)]
pub struct CallData {
    pub to: FieldElement,
    pub selector: FieldElement,
    pub calldata: Vec<FieldElement>,
}

#[derive(Debug, Clone, Hash, Default, Serialize)]
pub struct Call {
    pub data: CallData,
    pub signature: Signature,
}

// #[derive(Clone, PartialEq, Default, Debug, Serialize, Deserialize)]
// pub struct FunctionResult {
//     pub version: u32,
//     pub quote: Vec<u8>,
//     pub fn_key: Vec<u8>,
//     pub signer: Vec<u8>,
//     pub fn_request_key: Vec<u8>,
//     pub fn_request_hash: Vec<u8>,
//     pub chain_result_info: StarknetFunctionResult,
// }
// pub struct StarknetFunctionResult {
//     pub txs: Vec<CallData>,
//     pub sigs: Vec<Vec<u8>>,
// }
pub async fn validate_user_fn(
    contract: Switchboard, // what is the type here @glihm
    enclave_wallet: SigningKey,
    verifier: Address,
    fr: &FunctionResult,
    enclave_key: FieldElement,
    // signer_balance: ,
) -> Result<(), Err> {
    // get function
    let starknet_result = &fr.chain_result_info;
    // let evm_result: EVMFunctionResult;
    // if let ChainResultInfo::(evm_result_info) = &fr.chain_result_info {
    //     evm_result = evm_result_info.clone();
    // } else {
    //     return Err(Err::FunctionResultInvalidData);
    // }

    let fn_key = &fr.fn_key;
    let fn_data = contract
        .funcs(FieldElement::from_bytes(fn_key.as_ref()))
        .await
        .expect("funcs failed");

    // get verifier quote idx in attestation queue
    let enclave_idx_result = contract.get_enclave_idx(enclave_key).await.unwrap();
    if enclave_idx_result.clone().as_i64() < 0 {
        return Err(Err::InvalidQuoteError);
    }
    let enclave_idx = U256::from(enclave_idx_result.as_u64());

    // get current time to be checked against the block time on-chain
    let current_time = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or(Duration::ZERO)
        .as_secs();

    let expiration_time = current_time + 60;

    // figure out next allowed update time in seconds
    let next_allowed_update_time = {
        let dt: DateTime<Utc> = DateTime::from_utc(
            NaiveDateTime::from_timestamp_opt(i64::try_from(current_time).unwrap(), 0).unwrap(),
            Utc,
        );
        let every_second = Schedule::try_from("* * * * * *").unwrap();
        let schedule_string = if fn_data.config.schedule == "" {
            "* * * * * *"
        } else {
            fn_data.config.schedule.trim_end_matches('\0')
        };

        let schedule = Schedule::try_from(schedule_string);
        let schedule = schedule.unwrap_or(every_second.clone());
        schedule.after(&dt).next().unwrap().timestamp()
    };

    // get the quote and verify the report data
    let quote = Quote::parse(&fr.quote).map_err(|_| Err::QuoteParseError)?;
    let report_keyhash = &quote.isv_report.report_data[..32];

    let fn_signer = fr.signer.as_slice();
    // if report_keyhash != Sha256::digest(&fn_signer).as_slice() {
    //     return Err(Err::InvalidQuoteError);
    // }

    // if the meta-tx fails, we have to register the call failure
    let mut is_failure = false;

    // check if the result is from a manual fn call
    // let has_call_ids = evm_result.call_ids.len() != 0;

    // get verify tx
    // let mut fn_verify_tx = if has_call_ids {
    //     // TODO: make this array at some point in the future. ATM constrained to 1 call id in a response tx
    //     let call_ids = evm_result
    //         .call_ids
    //         .iter()
    //         .map(|id| Address::from_slice(id.as_slice()))
    //         .collect::<Vec<_>>();
    //
    //     contract.function_verify_request(
    //         enclave_idx,
    //         Address::from_slice(fr.fn_key.as_slice()),
    //         Address::from_slice(fr.signer.as_slice()),
    //         U256::from(current_time),
    //         U256::from(next_allowed_update_time),
    //         // don't mark it as a failure unless the dry-run fails
    //         is_failure,
    //         // mr_enclave
    //         quote.isv_report.mrenclave.try_into().unwrap(),
    //         // get each of the Transaction inputs
    //         evm_result
    //             .txs
    //             .iter()
    //             .map(|tx| sdk::switchboard::Transaction::from(tx))
    //             .collect::<Vec<_>>(),
    //         // get each of the signatures as Bytes
    //         evm_result
    //             .signatures
    //             .iter()
    //             .map(|sig| Bytes::from(sig.clone()))
    //             .collect::<Vec<_>>(),
    //         call_ids,
    //     )
    // } else {
    let mut fn_verify_tx = contract.function_verify(
        enclave_idx,
        Address::from_slice(fr.fn_key.as_slice()),
        Address::from_slice(fr.signer.as_slice()),
        U256::from(current_time),
        U256::from(next_allowed_update_time),
        // don't mark it as a failure unless the dry-run fails
        is_failure,
        // mr_enclave
        quote.isv_report.mrenclave.try_into().unwrap(),
        // get each of the Transaction inputs
        evm_result
            .txs
            .iter()
            .map(|tx| sdk::switchboard::Transaction::from(tx))
            .collect::<Vec<_>>(),
        // get each of the signatures as Bytes
        evm_result
            .signatures
            .iter()
            .map(|sig| Bytes::from(sig.clone()))
            .collect::<Vec<_>>(),
    );
    // };

    fn_verify_tx.tx.set_from(enclave_wallet.address());

    // metatx within a metatx
    let txs = vec![fn_verify_tx.clone()];

    // forward with verifier
    // let verify_call = forward(
    //     contract.clone(),
    //     enclave_wallet.clone(),
    //     verifier.clone(),
    //     txs,
    //     expiration_time.try_into().unwrap(),
    //     signer_balance, // gas limit max
    // )
    // .unwrap();

    // let verify_dry_run = verify_call.clone().estimate_gas().await;

    // if let Some(Revert(bytes)) = verify_dry_run.as_ref().err() {
    //     let abi_err = sdk::switchboard::SwitchboardErrors::decode(&bytes);
    //     println!("{:?}", abi_err);
    // }

    // estimate gas
    // if estimate fails then handle failed call

    if let Err(err) = verify_dry_run {
        // mark failure
        is_failure = true;

        // print error
        println!("Error: {:?}", err);

        println!("Error verifying tx. Will fail it instead");

        // // handle failure for function request calls, but also for function verify
        // let mut fn_verify_tx = if has_call_ids {
        //     // call the other fn
        //     contract.function_verify_request(
        //         enclave_idx,
        //         Address::from_slice(fr.fn_key.as_slice()),
        //         Address::from_slice(fr.signer.as_slice()),
        //         U256::from(current_time),
        //         U256::from(next_allowed_update_time),
        //         // don't mark it as a failure unless the dry-run fails
        //         is_failure,
        //         // mr_enclave
        //         quote.isv_report.mrenclave.try_into().unwrap(),
        //         // no meta-tx forwarded upon failure
        //         Vec::new(),
        //         Vec::new(),
        //         // include the ids that are being failed in this call
        //         evm_result
        //             .call_ids
        //             .iter()
        //             .map(|id| Address::from_slice(id.as_slice()))
        //             .collect::<Vec<_>>(),
        //     )
        // } else {
        let fn_verify_tx = contract.function_verify(
            enclave_idx,
            Address::from_slice(fr.fn_key.as_slice()),
            Address::from_slice(fr.signer.as_slice()),
            U256::from(current_time),
            U256::from(next_allowed_update_time),
            // don't mark it as a failure unless the dry-run fails
            is_failure,
            // mr_enclave
            quote.isv_report.mrenclave.try_into().unwrap(),
            // no meta-tx forwarded upon failure
            Vec::new(),
            Vec::new(),
        );
        // };

        fn_verify_tx.tx.set_from(enclave_wallet.address());
        let txs = vec![fn_verify_tx];

        // forward txn to contract here

        // let fail_tx = forward(
        //     contract.clone(),
        //     enclave_wallet.clone(),
        //     verifier.clone(),
        //     txs,
        //     expiration_time.try_into().unwrap(),
        //     signer_balance, // gas limit max
        // )
        // .unwrap();

        // tx failure
        return Ok(fail_tx);
    }

    // tx success
    Ok(verify_call)
}

pub async fn process_function<T: JsonRpcClient + Clone>(
    payer_contract: Switchboard, //@glihm
    contract_address: FieldElement,
    enclave_wallet: LocalWallet,
    verifier: FieldElement,
    fr: &FunctionResult,
    enclave_key: FieldElement,
) -> Result<(), Err> {
    let client = payer_contract.client();
    let provider = client.provider();
    // let signer = SignerManager::next().await;
    // let signer = signer.with_chain_id(client.signer().chain_id());
    // let signer_client: EVMMiddleware<T> =
    //     SignerMiddleware::new((*provider).clone(), signer.clone());
    let contract = Switchboard::new(contract_address, signer_client.into());

    // get gas price
    let gas_price: U256 = provider.get_gas_price().await.unwrap();
    let min_balance = gas_price * U256::from(5_500_000); // formerly WEI_IN_ETHER.div(20)

    // make sure we can cover 5_500_000 gas at the current gas price (in case we need to forward)
    let signer_balance = provider.get_balance(signer.address(), None).await.unwrap();
    if signer_balance < min_balance {
        let transfer_tx = transfer_wei(&client, &signer.address(), min_balance * U256::from(2)) // previously WEI_IN_ETHER.div(10)
            .await
            .unwrap();
        let receipt = transfer_tx.await.unwrap().unwrap();
        println!("Transfer completed: {}", receipt.transaction_hash);
    }

    let tx = validate_user_fn(
        &contract,
        enclave_wallet,
        verifier,
        fr,
        enclave_key.clone(),
        // signer_balance,
    )
    .await;

    let key = format!("{:?}", Address::from_slice(fr.fn_key.as_slice()));
    if tx.is_err() {
        println!("{} error: {}", key, tx.as_ref().err().unwrap());
    }
    let tx = tx.unwrap();
    let res = tx.send().await;
    if res.is_err() {
        println!("{} error: {}", key, res.as_ref().err().unwrap());
    }
    let res = res.unwrap().log_msg("Function verify tx processed.").await;

    if res.is_err() {
        println!("Function {} failed: {:#?}", key, res.err().unwrap());
    } else {
        println!(
            "Function {:?} verified: {:?}",
            key,
            res.unwrap().unwrap().transaction_hash
        );
    }
    Ok(())
}
