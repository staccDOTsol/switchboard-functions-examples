use crate::*;
use chrono::DateTime;
use chrono::NaiveDateTime;
use chrono::Utc;
use cron::Schedule;
use ethers::abi::AbiDecode;
use ethers::prelude::ContractError;
use ethers::prelude::ContractError::Revert;
use ethers::signers::Signer;
use ethers::types::{Signature, H160};
use ethers::{
    contract::builders::ContractCall,
    core::{
        k256::ecdsa::SigningKey,
        types::{Address, Bytes, U256},
    },
    middleware::SignerMiddleware,
    providers::{JsonRpcClient, Middleware, Provider},
    signers::Wallet,
};
use futures::Future;
use sdk::Switchboard;
use sgx_quote::Quote;
use sha2::{Digest, Sha256};
use std::result::Result;
use std::str::FromStr;
use std::time::{Duration, SystemTime};
use switchboard_common::*;

type EVMMiddleware<T> = SignerMiddleware<Provider<T>, Wallet<SigningKey>>;
type EVMContract<T> = Switchboard<EVMMiddleware<T>>;

// Error codes for individual function calls
#[derive(Debug, Clone, Copy)]
enum ErrorCode {
    None = 0,
    NonExecutable = 201,
    InsufficientBalance = 202,
    ExcessiveTotalGas = 203,
    InsufficientFunding = 204,
    ExcessiveFunctionGas = 205,
    InvalidEnclaveMeasurement = 206,
    GenericError = 207,
    InternalAuthorityError = 208,
    InternalInvalidEnclaveError = 209,
    InternalIncorrectQueueError = 210,
    InternalIncorrectReportedTime = 211,
}

impl From<&EvmTransaction> for sdk::switchboard::Transaction {
    fn from(tx: &EvmTransaction) -> Self {
        sdk::switchboard::Transaction {
            expiration_time_seconds: U256::from(tx.expiration_time_seconds),
            gas_limit: U256::from_str_radix(&tx.gas_limit, 10).unwrap(),
            value: U256::from_str_radix(&tx.value, 10).unwrap(),
            to: Address::from_slice(&tx.to),
            from: Address::from_slice(&tx.from),
            data: tx.data.clone().into(),
        }
    }
}

struct CallRunData {
    pub id: Address,
    pub checksum: [u8; 32],
    pub tx: sdk::switchboard::Transaction,
    pub signature: Bytes,
    pub code: u8,
}

pub async fn validate_user_fn<T: JsonRpcClient + Clone + 'static>(
    contract: &EVMContract<T>,
    enclave_wallet: Wallet<SigningKey>,
    verifier: Address,
    fr: &FunctionResultV1,
    enclave_key: Address,
    signer_balance: U256,
    gas_price: U256,
) -> Result<ContractCall<EVMMiddleware<T>, ()>, Err> {
    let client = contract.client();
    let provider = client.provider();

    // get function
    let evm_result: EvmFunctionResult;
    if let ChainResultInfo::Evm(evm_result_info) = &fr.chain_result_info {
        evm_result = evm_result_info.clone();
    } else {
        return Err(Err::FunctionResultInvalidData);
    }

    // get EvmFunctionResultV1 from evm_result
    let evm_result = if let EvmFunctionResult::V1(evm_result) = evm_result {
        evm_result
    } else {
        return Err(Err::FunctionResultInvalidData);
    };

    let fn_key = Address::from_str(&evm_result.function_id).unwrap();
    let fn_data = contract
        .funcs(fn_key)
        .call()
        .await
        .map_err(|_| Err::EvmError)
        .unwrap();

    // hashes of the params supplied to function runs
    let checksums: Vec<[u8; 32]> = evm_result
        .checksums
        .into_iter()
        .map(|inner_checksum| {
            // turn String inner_checksum into [u8; 32]
            let mut arr = [0; 32]; // Initialize a [u8; 32] with zeros

            // @NOTE this could be a source of issues for the checksums (prefix 0x)
            let bytes = hex::decode(inner_checksum).unwrap();
            arr.copy_from_slice(&bytes);
            arr
        })
        .collect();

    // get verifier quote idx in attestation queue
    let enclave_idx_result = contract.get_enclave_idx(enclave_key).call().await.unwrap();
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
        let dt: DateTime<Utc> = DateTime::from_naive_utc_and_offset(
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

    // check if enclave itself is a valid sgx enclave
    let is_quote_data_valid = ecdsa_quote_verification(&fr.quote, current_time.try_into().unwrap());

    let report_keyhash = &quote.isv_report.report_data[..32];

    // get the signer of the function run
    let fn_signer = Address::from_str(&evm_result.signer).unwrap();

    // get the signer as bytes
    let fn_signer_bytes = fn_signer.as_bytes();

    if report_keyhash != Sha256::digest(&fn_signer_bytes.to_vec()).as_slice()
        || !is_quote_data_valid
    {
        return Err(Err::InvalidQuoteError);
    }

    let call_ids = evm_result
        .resolved_ids
        .iter()
        .map(|id| Address::from_str(id).unwrap())
        .collect::<Vec<_>>();

    // assuming call_ids.length == transactions.length == signatures.length, get the gas cost of running a functionVerify on each of the transactions
    let signer = fn_signer.clone();
    let current_time = U256::from(current_time);
    let next_allowed_update_time = U256::from(next_allowed_update_time);

    // what about when the call_ids length < transactions length? - this is the case when the function request is not a function verify

    // Get gas cost of individual runs - failed runs will have errors associated with them
    let gas_costs = join_parallel(evm_result.txs.iter().enumerate().map(|(i, tx)| {
        let signature = Bytes::from_str(&evm_result.signatures[i].clone()).unwrap();
        let call_id = call_ids[i];
        let checksum = checksums[i];
        get_gas_cost_of_individual_run(
            contract,
            enclave_idx,
            fn_key,
            signer,
            current_time,
            next_allowed_update_time,
            quote.isv_report.mrenclave.try_into().unwrap(),
            sdk::switchboard::Transaction::from(tx),
            signature,
            call_id,
            checksum,
            enclave_wallet.clone(),
            verifier,
            U256::from(expiration_time),
            signer_balance,
        )
    }))
    .await;

    // get failed calls
    let mut failed_calls: Vec<CallRunData> = Vec::new();
    let mut successful_calls: Vec<CallRunData> = Vec::new();

    // track cumulative gas cost for tx's so they don't exceed
    let mut cumulative_gas_cost = U256::from(0);
    let max_gas_price = gas_price * U256::from(5_500_000);

    // get the failed calls - ones that independently fail simulation or are too expensive in total (greater than 5.5 million gas)
    for (i, gas_cost) in gas_costs.iter().enumerate() {
        if let Ok(gas_cost) = gas_cost {
            // print success
            println!(
                "Simulation Success for call id: {:?} with gas cost: {:?}",
                call_ids[i], gas_cost
            );
            if cumulative_gas_cost + gas_cost > max_gas_price {

                println!(
                    "Actually, cumulative gas spend for call id: {:?} exceeded limit so sending it to fail route.",
                    call_ids[i]
                );
                failed_calls.push(CallRunData {
                    id: call_ids[i],
                    checksum: checksums[i],
                    tx: sdk::switchboard::Transaction::from(&evm_result.txs[i]),
                    signature: Bytes::from_str(&evm_result.signatures[i].clone()).unwrap(),
                    code: ErrorCode::ExcessiveTotalGas as u8,
                });
                continue;
            }
            cumulative_gas_cost += *gas_cost;
            successful_calls.push(CallRunData {
                id: call_ids[i],
                checksum: checksums[i],
                tx: sdk::switchboard::Transaction::from(&evm_result.txs[i]),
                signature: Bytes::from_str(&evm_result.signatures[i].clone()).unwrap(),
                code: ErrorCode::None as u8,
            });
        } else if let Err(err) = gas_cost {
            println!(
                "[RAW CALL ERROR] FN:{:?} CALL:{:?} ERR:{:?}",
                fn_key, call_ids[i], err
            );

            // Mark failure and get error code
            match err {
                Revert(bytes) => {
                    let abi_err = sdk::switchboard::SwitchboardErrors::decode(&bytes);
                    match abi_err {
                        Ok(switchboard_error) => {
                            match switchboard_error {
                                SwitchboardErrors::InsufficientCallBalance(error) => {
                                    // Handle InsufficientCallBalance error
                                    println!(
                                        "Call ID: {:?}, Error: InsufficientCallBalance: {:?}",
                                        call_ids[i], error
                                    );
                                    failed_calls.push(CallRunData {
                                        id: call_ids[i],
                                        checksum: checksums[i],
                                        tx: sdk::switchboard::Transaction::from(&evm_result.txs[i]),
                                        signature: Bytes::from_str(
                                            &evm_result.signatures[i].clone(),
                                        )
                                        .unwrap(),
                                        code: ErrorCode::InsufficientBalance as u8,
                                    });
                                }

                                SwitchboardErrors::InsufficientCallFeePaid(error) => {
                                    // Handle InsufficientCallFeePaid error
                                    println!(
                                        "Call ID: {:?}, InsufficientCallFeePaid: {:?}",
                                        call_ids[i], error
                                    );
                                    failed_calls.push(CallRunData {
                                        id: call_ids[i],
                                        checksum: checksums[i],
                                        tx: sdk::switchboard::Transaction::from(&evm_result.txs[i]),
                                        signature: Bytes::from_str(
                                            &evm_result.signatures[i].clone(),
                                        )
                                        .unwrap(),
                                        code: ErrorCode::InsufficientBalance as u8,
                                    });
                                }

                                // Handle other errors as "Non-executable"
                                other_error => {
                                    // Handle the default case
                                    println!(
                                        "Call ID: {:?}, Error: {:?}",
                                        call_ids[i], other_error
                                    );
                                    failed_calls.push(CallRunData {
                                        id: call_ids[i],
                                        checksum: checksums[i],
                                        tx: sdk::switchboard::Transaction::from(&evm_result.txs[i]),
                                        signature: Bytes::from_str(
                                            &evm_result.signatures[i].clone(),
                                        )
                                        .unwrap(),
                                        code: ErrorCode::NonExecutable as u8,
                                    });
                                }
                            }
                        }

                        Err(abi_error) => {
                            // Handle the case where the error is not one of the SwitchboardErrors
                            println!("AbiError: {:?}", abi_error);
                            failed_calls.push(CallRunData {
                                id: call_ids[i],
                                checksum: checksums[i],
                                tx: sdk::switchboard::Transaction::from(&evm_result.txs[i]),
                                signature: Bytes::from_str(&evm_result.signatures[i].clone())
                                    .unwrap(),
                                code: ErrorCode::NonExecutable as u8,
                            });
                        }
                    }
                }
                _ => {
                    println!("Error: {:?}", err);
                    failed_calls.push(CallRunData {
                        id: call_ids[i],
                        checksum: checksums[i],
                        tx: sdk::switchboard::Transaction::from(&evm_result.txs[i]),
                        signature: Bytes::from_str(&evm_result.signatures[i].clone()).unwrap(),
                        code: ErrorCode::NonExecutable as u8,
                    });
                }
            }
        }
    }

    // get txs to forward
    let mut txs: Vec<ContractCall<EVMMiddleware<T>, ()>> = Vec::new();

    // put successful calls in verify tx
    if successful_calls.len() != 0 {

        // get verify tx
        txs.push({
            // Get each of the fields as vecs
            let (mut call_ids, checksums, txs, signatures, error_codes) = (
                successful_calls
                    .iter()
                    .map(|call| call.id)
                    .collect::<Vec<_>>(),
                successful_calls
                    .iter()
                    .map(|call| call.checksum)
                    .collect::<Vec<_>>(),
                successful_calls
                    .iter()
                    .map(|call| call.tx.clone())
                    .collect::<Vec<_>>(),
                successful_calls
                    .iter()
                    .map(|call| call.signature.clone())
                    .collect::<Vec<_>>(),
                successful_calls
                    .iter()
                    .map(|call| call.code)
                    .collect::<Vec<_>>(),
            );

            // if call_ids.len() > evm_result.txs.len() - make call_ids into call_ids in function result
            if call_ids.len() >= evm_result.txs.len() {
                call_ids = evm_result
                    .resolved_ids
                    .iter()
                    .map(|id| Address::from_str(id).unwrap())
                    .collect::<Vec<_>>();
            }

            let mut fn_verify_tx =
                contract.verify_function_result(sdk::switchboard::FunctionVerifyParams {
                    enclave_idx,
                    function_id: fn_key,
                    delegated_signer_address: signer,
                    observed_time: U256::from(current_time),
                    next_allowed_timestamp: U256::from(next_allowed_update_time),
                    mr_enclave: quote.isv_report.mrenclave.try_into().unwrap(),
                    transactions: txs,
                    signatures,
                    ids: call_ids,
                    checksums,
                    codes: error_codes
                        .iter()
                        .map(|code| *code as u8)
                        .collect::<Vec<_>>(),
                });
            fn_verify_tx.tx.set_from(enclave_wallet.address());
            fn_verify_tx
        });
    }


    // put failed calls into a fail tx
    if failed_calls.len() != 0 {

        // Get each of the fields as vecs
        let (call_ids, checksums, error_codes) = (
            failed_calls.iter().map(|call| call.id).collect::<Vec<_>>(),
            failed_calls
                .iter()
                .map(|call| call.checksum)
                .collect::<Vec<_>>(),
            failed_calls
                .iter()
                .map(|call| call.code)
                .collect::<Vec<_>>(),
        );

        // failure code for the entire function run - 0 for no error on the function run
        let fail_params = sdk::switchboard::FunctionFailParams {
            enclave_idx,
            function_id: fn_key,
            observed_time: U256::from(current_time),
            next_allowed_timestamp: U256::from(next_allowed_update_time),
            code: ErrorCode::None as u8,
            ids: call_ids,
            checksums: checksums,
            codes: error_codes,
        };

        // handle failure for function request calls, but also for function verify
        let mut fn_fail_tx = contract.fail_function_result(fail_params);
        fn_fail_tx.tx.set_from(enclave_wallet.address());

        // wrap in the metatx
        txs.push(fn_fail_tx);
    }

    // forward with verifier
    let verify_call = forward(
        contract.clone(),
        enclave_wallet.clone(),
        verifier.clone(),
        txs,
        expiration_time.try_into().unwrap(),
        signer_balance, // gas limit max
    )
    .unwrap();

    let verify_dry_run = verify_call.clone().estimate_gas().await;

    // get error code for the function run
    let function_error_code = if let Some(Revert(bytes)) = verify_dry_run.as_ref().err() {
        println!("{:?}: [RAW TX ERROR] {:?}", fn_key, bytes);
        let abi_err = sdk::switchboard::SwitchboardErrors::decode(&bytes);
        let key = fn_key.clone();
        let code;

        match abi_err {
            Ok(switchboard_error) => {
                match switchboard_error {
                    SwitchboardErrors::InvalidAuthority(error) => {
                        // Handle InvalidAuthority error
                        println!("{:?}: [INTERNAL ERROR] InvalidAuthority {:?}", key, error);
                        code = ErrorCode::InternalAuthorityError;
                    }

                    SwitchboardErrors::InvalidEnclave(error) => {
                        // Handle InvalidEnclave error
                        println!("{:?}: [INTERNAL ERROR] InvalidEnclave {:?}", key, error);
                        code = ErrorCode::InternalInvalidEnclaveError;
                    }

                    SwitchboardErrors::QueuesDoNotMatch(error) => {
                        // Handle QueuesDoNotMatch error
                        println!("{:?}: [INTERNAL ERROR] QueuesDoNotMatch {:?}", key, error);
                        code = ErrorCode::InternalIncorrectQueueError;
                    }

                    SwitchboardErrors::IncorrectReportedTime(error) => {
                        // Handle IncorrectReportedTime error
                        println!(
                            "{:?}: [INTERNAL ERROR] IncorrectReportedTime {:?}",
                            key, error
                        );
                        code = ErrorCode::InternalIncorrectReportedTime;
                    }

                    SwitchboardErrors::FunctionMrEnclaveMismatch(error) => {
                        // Handle FunctionMrEnclaveMismatch error
                        println!("{:?}: Invalid Enclave Measurement {:?}", key, error);
                        code = ErrorCode::InvalidEnclaveMeasurement;
                    }

                    SwitchboardErrors::ExcessiveGasSpent(error) => {
                        // Handle ExcessiveGasSpent error - exceeds 5.5 million gas
                        println!(
                            "{:?}: Gas Spent Exceeds System Cap of 5.5 million {:?}",
                            key, error
                        );
                        code = ErrorCode::ExcessiveTotalGas;
                    }

                    SwitchboardErrors::GasLimitExceeded(error) => {
                        // Handle GasLimitExceeded error
                        println!(
                            "{:?}: Gas Spent Exceeds function-set gas limit for the tx {:?}",
                            key, error
                        );
                        code = ErrorCode::ExcessiveFunctionGas;
                    }

                    SwitchboardErrors::InsufficientCallBalance(error) => {
                        // Handle InsufficientCallBalance error
                        println!("{:?}: InsufficientCallBalance {:?}", key, error);
                        code = ErrorCode::InsufficientBalance;
                    }

                    SwitchboardErrors::RevertString(error) => {
                        // Handle InsufficientCallFeePaid error
                        println!("{:?}: RevertString {:?}", key, error);
                        code = ErrorCode::GenericError;
                    }

                    // Handle other errors as "Non-executable"
                    other_error => {
                        // Handle the default case
                        println!("{:?}: Failed Execution {:?}", key, other_error);
                        code = ErrorCode::GenericError;
                    }
                }
            }
            Err(abi_error) => {
                // Handle the case where the error is not one of the SwitchboardErrors
                println!("{:?}: {:?}", key, abi_error);
                code = ErrorCode::GenericError;
            }
        }

        code
    } else {
        ErrorCode::None
    };

    if let Err(err) = verify_dry_run {
        // print error
        println!("Error: {:?}", err);

        println!("Error verifying tx. Will fail it instead");

        // call ids that failed simulation
        let failed_call_ids = evm_result
            .resolved_ids
            .iter()
            .map(|id| Address::from_str(id).unwrap())
            .collect::<Vec<_>>();

        // checksums of the params of the calls failed simulation
        let failed_checksums = checksums
            .iter()
            .map(|checksum| *checksum)
            .collect::<Vec<_>>();

        // mark the error codes for the failed calls with the function fail error
        let error_codes = evm_result
            .resolved_ids
            .iter()
            .map(|_| function_error_code)
            .collect::<Vec<_>>();

        // failure code for the entire function run - 0 for no error on the function run
        let fail_params = sdk::switchboard::FunctionFailParams {
            enclave_idx,
            function_id: fn_key,
            observed_time: U256::from(current_time),
            next_allowed_timestamp: U256::from(next_allowed_update_time),
            code: function_error_code as u8,
            ids: failed_call_ids,
            checksums: failed_checksums,
            codes: error_codes
                .iter()
                .map(|code| *code as u8)
                .collect::<Vec<_>>(),
        };

        // handle failure for function request calls, but also for function verify
        let mut fn_fail_tx = contract.fail_function_result(fail_params);
        fn_fail_tx.tx.set_from(enclave_wallet.address());

        // wrap in the metatx
        let fail_tx = forward(
            contract.clone(),
            enclave_wallet.clone(),
            verifier.clone(),
            vec![fn_fail_tx],
            expiration_time.try_into().unwrap(),
            signer_balance, // gas limit max
        )
        .unwrap();

        // tx failure
        return Ok(fail_tx);
    }

    // tx success
    Ok(verify_call)
}

// Explicitly fail a function result when function never runs
pub async fn fail_function_result<T: JsonRpcClient + Clone + 'static>(
    contract: &EVMContract<T>,
    enclave_wallet: Wallet<SigningKey>,
    verifier: Address,
    fr: &FunctionResultV1,
    enclave_key: Address,
    signer_balance: U256,
) -> Result<ContractCall<EVMMiddleware<T>, ()>, Err> {
    let client = contract.client();
    let provider = client.provider();

    // get current time to be checked against the block time on-chain
    let current_time = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or(Duration::ZERO)
        .as_secs();

    // get gas price for the calls
    let gas_price: U256 = provider.get_gas_price().await.unwrap();

    // get function
    let evm_result: EvmFunctionResult;
    if let ChainResultInfo::Evm(evm_result_info) = &fr.chain_result_info {
        evm_result = evm_result_info.clone();
    } else {
        return Err(Err::FunctionResultInvalidData);
    }

    // get EvmFunctionResultV1 from evm_result
    let evm_result = if let EvmFunctionResult::V1(evm_result) = evm_result {
        evm_result
    } else {
        return Err(Err::FunctionResultInvalidData);
    };

    let fn_key = Address::from_str(&evm_result.function_id).unwrap();
    let fn_data = contract
        .funcs(fn_key)
        .call()
        .await
        .map_err(|_| Err::EvmError)
        .unwrap();

    // get verifier quote idx in attestation queue
    let enclave_idx_result = contract.get_enclave_idx(enclave_key).call().await.unwrap();
    if enclave_idx_result.clone().as_i64() < 0 {
        return Err(Err::InvalidQuoteError);
    }
    let enclave_idx = U256::from(enclave_idx_result.as_u64());

    // call ids that failed simulation
    let failed_call_ids = evm_result
        .resolved_ids
        .iter()
        .map(|id| Address::from_str(id).unwrap())
        .collect::<Vec<_>>();
    let fail_params = sdk::switchboard::FunctionFailParams {
        enclave_idx,
        function_id: fn_key,
        observed_time: U256::from(current_time),
        next_allowed_timestamp: U256::from(current_time),
        code: fr.error_code,
        ids: failed_call_ids,
        checksums: Vec::new(),
        codes: evm_result.error_codes,
    };

    // handle failure for function request calls, but also for function verify
    let mut fn_verify_tx = contract.fail_function_result(fail_params);
    fn_verify_tx.tx.set_from(enclave_wallet.address());

    // wrap in the metatx
    let fail_tx = forward(
        contract.clone(),
        enclave_wallet.clone(),
        verifier.clone(),
        vec![fn_verify_tx],
        (current_time + 60).try_into().unwrap(),
        signer_balance, // gas limit max
    )
    .unwrap();

    Ok(fail_tx)
}

pub async fn process_function<T: JsonRpcClient + Clone + 'static>(
    payer_contract: EVMContract<T>,
    contract_address: H160,
    enclave_wallet: Wallet<SigningKey>,
    verifier: Address,
    fr: &FunctionResult,
    enclave_key: Address,
) -> Result<(), Err> {
    let client = payer_contract.client();
    let provider = client.provider();
    let signer = SignerManager::next().await;
    let signer = signer.with_chain_id(client.signer().chain_id());
    let signer_client: EVMMiddleware<T> =
        SignerMiddleware::new((*provider).clone(), signer.clone());
    let contract: EVMContract<T> = Switchboard::new(contract_address, signer_client.into());

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

    // get fr as FunctionResultV1
    let fr = if let FunctionResult::V1(fr) = fr {
        fr
    } else {
        return Err(Err::FunctionResultInvalidData);
    };

    // get EvmFunctionResultV1 from chain info from fr
    let evm_result_info = if let ChainResultInfo::Evm(chain_info) = &fr.chain_result_info {
        chain_info.clone()
    } else {
        return Err(Err::FunctionResultInvalidData);
    };

    // get EvmFunctionResultV1 from evm_result
    let evm_result = if let EvmFunctionResult::V1(evm_result) = evm_result_info {
        evm_result
    } else {
        return Err(Err::FunctionResultInvalidData);
    };

    // if the function result has an error code, then we should fail the function result
    let is_valid_signature: bool =
        !verify_fr_signature(&fr).is_err() && evm_result.resolved_ids.len() > 0;

    let tx = if fr.error_code == 0 && is_valid_signature {
        println!("Running Validate Function Result for FN {:?}", evm_result.function_id);
        // println!("FR {:#?}", evm_result);
        validate_user_fn(
            &contract,
            enclave_wallet,
            verifier,
            fr,
            enclave_key.clone(),
            signer_balance,
            gas_price,
        )
        .await
    } else {
        println!(
            "Running Fail Function Result for FN {:?}",
            evm_result.function_id
        );
        fail_function_result(
            &contract,
            enclave_wallet,
            verifier,
            fr,
            enclave_key.clone(),
            signer_balance,
        )
        .await
    };

    let key = Address::from_str(&evm_result.function_id).unwrap();

    if tx.is_err() {
        println!("{:?} tx-error: {}", key, tx.as_ref().err().unwrap());
    }

    // TODO: THESE UNWRAPS
    let tx = tx.unwrap();
    let pending_tx = tx.send().await;
    if pending_tx.is_err() {
        println!(
            "{:?} send-error: {}",
            key,
            pending_tx.as_ref().err().unwrap()
        );
    } else {
        // let process_log = format!("Function verify tx processed for {:?}.", key);
        // let res = res.unwrap().log_msg(process_log).await;
        let tx_hash = pending_tx.unwrap().tx_hash();
        println!("Function {:?} verified: {:?}", key, tx_hash);
    }
    Ok(())
}

// https://stackoverflow.com/a/63437482
async fn join_parallel<T: Send + 'static>(
    futs: impl IntoIterator<Item = impl Future<Output = T> + Send + 'static>,
) -> Vec<T> {
    let tasks: Vec<_> = futs.into_iter().map(tokio::spawn).collect();
    futures::future::join_all(tasks)
        .await
        .into_iter()
        .map(Result::unwrap)
        .collect()
}

fn get_gas_cost_of_individual_run<'a, T: JsonRpcClient + Clone + 'a>(
    contract: &EVMContract<T>,
    enclave_idx: U256,
    fn_key: Address,
    signer: Address,
    current_time: U256,
    next_allowed_update_time: U256,
    mr_enclave: [u8; 32],
    tx: sdk::switchboard::Transaction,
    signature: Bytes,
    call_id: Address,
    checksum: [u8; 32],
    enclave_wallet: Wallet<SigningKey>,
    verifier: Address,
    expiration_time: U256,
    signer_balance: U256,
) -> impl Future<Output = Result<U256, ContractError<EVMMiddleware<T>>>> + 'a {
    let contract = contract.clone();
    async move {
        let mut verify_req =
            contract.verify_function_result(sdk::switchboard::FunctionVerifyParams {
                enclave_idx,
                function_id: fn_key,
                delegated_signer_address: signer,
                observed_time: current_time,
                next_allowed_timestamp: next_allowed_update_time,
                mr_enclave,
                transactions: vec![tx],
                signatures: vec![signature],
                ids: vec![call_id],
                checksums: vec![checksum],
                codes: vec![0], // mark as non-error for simulation
            });

        verify_req.tx.set_from(enclave_wallet.address());

        // metatx within a metatx
        let txs = vec![verify_req];

        // forward with verifier
        let verify_call = forward(
            contract.clone(),
            enclave_wallet.clone(),
            verifier.clone(),
            txs,
            expiration_time.try_into().unwrap(),
            signer_balance, // gas limit max
        )
        .unwrap();

        let gas_cost = verify_call.estimate_gas().await;

        // get gas cost for each run
        gas_cost
    }
}

pub fn verify_fr_signature(fr: &FunctionResultV1) -> Result<(), Err> {
    // get EvmFunctionResult enum variant from ChainResultInfo
    let evm_fr = match &fr.chain_result_info {
        ChainResultInfo::Evm(fr) => fr,
        _ => {
            return Err(Err::FunctionResultInvalidData);
        }
    };

    // get the EvmFunctionResultV1 struct
    let evm_fr = match evm_fr {
        EvmFunctionResult::V1(fr) => fr,
        _ => {
            return Err(Err::FunctionResultInvalidData);
        }
    };

    // Attempt to get hash as [u8; 32] from Vec<u8>
    let hash: [u8; 32] = evm_fr
        .hash()
        .as_slice()
        .try_into()
        .map_err(|_| Err::FunctionResultInvalidData)?;

    let signer = Address::from_str(&evm_fr.signer).map_err(|_| Err::FunctionResultInvalidData)?;

    // convert the [u8; 65] into Signature
    let signature =
        Signature::try_from(fr.signature.as_slice()).map_err(|_| Err::FunctionResultInvalidData)?;

    // verify signature and get Result
    signature
        .verify(ethers::types::H256::from(hash), signer)
        .map_err(|_| Err::FunctionResultInvalidData)?;

    // If the signature verification was successful, return Ok(())
    Ok(())
}
