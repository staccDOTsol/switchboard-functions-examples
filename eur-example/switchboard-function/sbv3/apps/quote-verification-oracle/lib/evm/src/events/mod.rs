use crate::*;
use ethers::prelude::*;
use ethers::{
    core::{
        k256::ecdsa::SigningKey,
        types::{Address, I256},
    },
    middleware::SignerMiddleware,
    providers::{JsonRpcClient, Middleware, Provider, StreamExt},
    signers::Wallet,
};
use hyper;
use hyper::server::Server;
use hyper::service::{make_service_fn, service_fn};
use hyper::{Body, Request, Response};
use sdk::Switchboard;
use sgx_quote;
use sha2::{Digest, Sha256};
use std::result::Result;
use std::sync::Arc;
use std::time::{Duration, SystemTime};
use switchboard_common::*;

type EVMContract<T> = Switchboard<SignerMiddleware<Provider<T>, Wallet<SigningKey>>>;

pub async fn watch_function_verify_events<T: JsonRpcClient + 'static + Clone>(
    contract: EVMContract<T>,
    contract_address: H160,
    enclave_wallet: Wallet<SigningKey>,
    verifier: Arc<Address>,
    enclave_key: Arc<Address>,
) {
    Server::bind(&"0.0.0.0:3000".parse().unwrap())
        .serve(make_service_fn(|_conn| {
            let enclave_key = enclave_key.clone();
            let verifier = verifier.clone();
            let contract = contract.clone();
            let enclave_wallet = enclave_wallet.clone();
            let contract_address = contract_address.clone();
            async move {
                Ok::<_, hyper::Error>(service_fn(move |req: Request<Body>| {
                    let enclave_key = enclave_key.clone();
                    let verifier = verifier.clone();
                    let contract = contract.clone();
                    let enclave_wallet = enclave_wallet.clone();
                    let contract_address = contract_address.clone();
                    async move {
                        println!("_-_-_-_ == QVN REQUEST RECEIVED == _-_-_-_");
                        let bytes = hyper::body::to_bytes(req.into_body()).await?;
                        // println!("{:?}", String::from_utf8_lossy(&bytes));
                        let fr = serde_json::from_slice(&bytes);
                        if fr.is_err() {
                            return Ok(Response::new(Body::from(format!("FAILURE: {:#?}\n", fr))));
                        }
                        let fr: FunctionResult = fr.unwrap();
                        let res = process_function(
                            contract,
                            contract_address,
                            enclave_wallet,
                            *verifier,
                            &fr,
                            *enclave_key,
                        )
                        .await;
                        if res.is_err() {
                            return Ok(Response::new(Body::from(format!("FAILURE: {:#?}\n", res))));
                        }
                        Ok::<_, hyper::Error>(Response::new(Body::from("Ok\n")))
                    }
                }))
            }
        }))
        .await
        .unwrap();
}

pub async fn subscribe_to_verify_event<T: JsonRpcClient>(
    contract: EVMContract<T>,
    enclave_wallet: Wallet<SigningKey>,
    verifying_address: Address,
    latest_block: u64,
    ipfs_manager: IPFSManager,
) -> Result<(), Err> {
    let events = contract.events().from_block(latest_block);

    println!("Listening to verify events");

    let mut stream = events.stream().await.unwrap();
    while let Some(Ok(f)) = stream.next().await {
        match f {
            SwitchboardEvents::EnclaveVerifyRequestFilter(event) => {
                println!("EnclaveVerifyRequest event: {:?}", event);

                // handle verify event
                on_verify_event(
                    &contract,
                    enclave_wallet.clone(),
                    event,
                    verifying_address,
                    &ipfs_manager,
                )
                .await;
            }
            _ => {
                println!("Other event");
            }
        }
    }

    // log failure - it should listen forever
    println!("CATASTROPHIC FAILURE");

    Ok(())
}

pub async fn on_verify_event<T: JsonRpcClient>(
    contract: &EVMContract<T>,
    enclave_wallet: Wallet<SigningKey>,
    event: EnclaveVerifyRequestFilter,
    enclave_address: Address, // our enclave address
    ipfs_manager: &IPFSManager,
) {
    println!("{:#?}\n===", event);
    if event.verifier != enclave_address {
        println!("Not assigned...");
        return;
    }

    let new_enclave_address = event.verifiee;
    let enclave_result = contract.enclaves(new_enclave_address).call().await;

    if let Err(e) = enclave_result {
        println!("Error getting enclave: {:?}", e);
        return;
    }

    let enclave = enclave_result.unwrap();

    // get raw quote cid
    let quote_cid = enclave.cid.as_ref();

    // get ipfs data or empty string
    let quote_cid = String::from_utf8(quote_cid.to_vec()).unwrap_or_default();

    println!("GOT CID: {}", quote_cid);

    let ipfs_quote_result = ipfs_manager.get_object(quote_cid).await;
    let ipfs_quote: Vec<u8> = ipfs_quote_result.unwrap_or_default();

    // println!("GOT QUOTE: {:?}", ipfs_quote);

    let current_time = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or(Duration::ZERO)
        .as_secs();

    // get current quote index (view fn)
    let enclave_idx_result = contract.get_enclave_idx(enclave_address).call().await;

    if let Err(e) = enclave_idx_result {
        println!("Error getting enclave index: {:?}", e);
        return;
    }

    let enclave_idx = enclave_idx_result.unwrap();

    println!("QUOTE IDX: {}", enclave_idx);

    // check if enclave itself is a valid sgx enclave
    let mut is_quote_data_valid =
        ecdsa_quote_verification(&ipfs_quote, current_time.try_into().unwrap());

    let mut mr_enclave_arr: [u8; 32] = [0; 32]; // Initialize an array of the same size

    if enclave_idx == I256::from(-1) {
        println!("Enclave is not on Queue. It must heartbeat.");
        return;
    }

    // verify the data within the quote matches expected owner on-chain
    if is_quote_data_valid {
        // verify the quote data
        let parsed_quote = sgx_quote::Quote::parse(&ipfs_quote).unwrap();

        let mr_enclave = parsed_quote.isv_report.mrenclave;
        let report_data = parsed_quote.isv_report.report_data;

        // get the report data - hash of the verifiee quote authority
        let mut hasher = Sha256::new();
        hasher.update(enclave.signer.as_bytes());
        let hash_result = &hasher.finalize()[..32];
        let mut expected_report_data = [0u8; 64];
        expected_report_data[..32].copy_from_slice(hash_result);

        // Copy the elements from the slice into the array
        mr_enclave_arr.copy_from_slice(&mr_enclave[..32]);

        // they should be equal
        is_quote_data_valid = expected_report_data[..].eq(report_data);
    }

    // TODO: clean this up so it only allocates the needed amount of value to gas
    // get payer balance
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

    // try verify quote
    if !is_quote_data_valid {
        //=================
        // fail quote because it's invalid
        //
        let mut fail_enclave = contract.fail_enclave(
            event.verifier,
            new_enclave_address,
            enclave_idx.try_into().unwrap(),
        );
        fail_enclave.tx.set_from(enclave_wallet.address());

        // metatx within a metatx
        let fail_enclave = vec![fail_enclave];

        // send off function tx
        let res = forward(
            contract.clone(),
            enclave_wallet.clone(),           // this enclave wallet
            enclave_wallet.address(),         // the address corresponding to the enclave wallet
            fail_enclave, // metatransactions (1 for the verify_function call, which itself can forward many more)
            timeout_time.try_into().unwrap(), // time in 30 seconds
            balance,      // @TODO: gas limit max  - maybe fix this so it's not the whole balance
        )
        .unwrap()
        .send()
        .await
        .unwrap()
        .log_msg("Enclave Fail Meta-Tx processed.")
        .await;

        if let Err(e) = res {
            println!("Error sending transaction: {:?}", e);
            return;
        }
        let res = res.unwrap();
        if let Some(resp) = res {
            println!("Fail tx hash {:?}", resp.transaction_hash);
        }
    } else {
        //=================
        // send verify enclave tx
        //
        let mut verify_enclave = contract.verify_enclave(
            event.verifier,
            new_enclave_address,
            enclave_idx.try_into().unwrap(),
            current_time.into(),
            mr_enclave_arr,
        );
        verify_enclave.tx.set_from(enclave_wallet.address());

        // metatx within a metatx
        let verify_enclave = vec![verify_enclave];

        // send off function tx
        forward(
            contract.clone(),
            enclave_wallet.clone(),           // this enclave wallet
            enclave_wallet.address(),         // the address corresponding to the enclave wallet
            verify_enclave, // metatransactions (1 for the verify_function call, which itself can forward many more)
            timeout_time.try_into().unwrap(), // time in 30 seconds
            balance,        // @TODO: gas limit max  - maybe fix this so it's not the whole balance
        )
        .unwrap()
        .send()
        .await
        .unwrap()
        .log_msg("Enclave Verify Meta-Tx processed.")
        .await
        .unwrap_or_default();
    }
}
