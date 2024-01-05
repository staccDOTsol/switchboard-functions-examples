use crate::*;

use base58::ToBase58;
use sgx_quote::Quote;
use sha2::{Digest, Sha256};

use hyper;
use hyper::server::Server;
use hyper::service::{make_service_fn, service_fn};
use hyper::{Body, Request, Response, StatusCode};
use std::ops::Deref;
use std::{
    str::FromStr,
    sync::Arc,
    time::{Duration, SystemTime},
};
use switchboard_solana::ChainResultInfo::Solana;
use switchboard_solana::{ChainResultInfo, LegacyFunctionResult};
use serde_json::json;
use crate::SolanaFunctionResult::*;
use switchboard_solana::SolanaFunctionRequestType::*;
use tokio::sync::RwLock;

macro_rules! json_error {
    ($fn_key:expr, $call_key:expr, $err:expr) => {
        Ok::<_, hyper::Error>(Response::new(Body::from(json!({
            "error": format!("{:?}", $err),
            "fn_key": format!("{:?}", $fn_key),
            "call_key": format!("{:?}", $call_key),
        }).to_string())));
    }
}


macro_rules! json_ok {
    ($fn_key:expr, $call_key:expr, $msg:expr) => {
        Ok::<_, hyper::Error>(Response::new(Body::from(json!({
            "signature": format!("{:?}", $msg),
            "fn_key": format!("{:?}", $fn_key),
            "call_key": format!("{:?}", $call_key),
        }).to_string())));
    }
}

pub fn get_req_key(fr: &FunctionResult) -> Pubkey {
    let mut pubkey_buf = vec![];
    match fr {
        FunctionResult::V0(FunctionResultV0 {
            chain_result_info,
            fn_request_key,
            ..
        }) => {
            pubkey_buf = fn_request_key.clone();
            if pubkey_buf.is_empty() {
                if let Solana(cri) = chain_result_info {
                    if let V1(cri_v1) = cri {
                        match &cri_v1.request_type {
                            Routine(buf) => {
                                pubkey_buf = buf.clone();
                            }
                            Request(buf) => {
                                pubkey_buf = buf.clone();
                            }
                            Function(buf) => {
                                pubkey_buf = buf.clone();
                            }
                        };
                    }
                }
            }
        }
        FunctionResult::V1(FunctionResultV1 {
            chain_result_info: _,
            ..
        }) => {
            if let Ok(Solana(cri)) = fr.chain_result_info() {
                if let V1(cri_v1) = cri {
                    match &cri_v1.request_type {
                        Routine(buf) => {
                            pubkey_buf = buf.clone();
                        }
                        Request(buf) => {
                            pubkey_buf = buf.clone();
                        }
                        Function(buf) => {
                            pubkey_buf = buf.clone();
                        }
                    };
                }
            }
        }
    }
    Pubkey::try_from_slice(&pubkey_buf).unwrap_or_default()
}

pub async fn watch_function_verify_events(validator: Arc<FunctionResultValidator>) {
    Server::bind(&"0.0.0.0:3000".parse().unwrap())
        .serve(make_service_fn(|_conn| {
            let mvalidator = validator.clone();
            async move {
                /// Returns a `Service` that handles incoming HTTP requests for the quote verification oracle.
                /// The service processes the request body, verifies the function call, and returns a response.
                let mvalidator = mvalidator.clone();
                Ok::<_, hyper::Error>(service_fn(move |req: Request<Body>| {
                    let mvalidator = mvalidator.clone();
                    async move {
                        let bytes: Vec<u8> = hyper::body::to_bytes(req.into_body())
                            .await
                            .unwrap_or_default()
                            .to_vec();
                        let fr: FunctionResult = match serde_json::from_slice(&bytes) {
                            Ok(fr) => fr,
                            Err(_e) => {
                                let serde_result: Result<
                                    LegacyFunctionResult,
                                    serde_json::error::Error,
                                > = serde_json::from_slice(&bytes);
                                match serde_result {
                                    Ok(fr) => fr.into(),
                                    Err(e) => {
                                        println!("QVN FAILURE: Failed to decode - {:?}", e);
                                        return json_error!("", "", e);
                                    }
                                }
                            }
                        };

                        // Attempt to get the function pubkey so we can use it as the log ID
                        let fn_pubkey = Pubkey::try_from_slice(fr.fn_key().unwrap().as_slice())
                            .unwrap_or_default();
                        let req_pubkey = get_req_key(&fr);

                        match fr.chain_result_info().unwrap() {
                            ChainResultInfo::Solana(_) => {}
                            _ => {
                                println!(
                                    "{}, {}: Invalid function result, QVN IS SET TO SOLANA MODE",
                                    fn_pubkey, req_pubkey
                                );
                                return json_error!(fn_pubkey, req_pubkey, "FAILURE: Incorrect oracle chain");
                            }
                        };

                        match mvalidator.process(&fr).await {
                            Ok(signature) => {
                                println!(
                                    "{},{}: QVN SUCCESS: {:?}",
                                    fn_pubkey, req_pubkey, signature
                                );
                                return json_ok!(fn_pubkey, req_pubkey, signature);
                            }
                            Err(e) => {
                                println!("{},{}: QVN ERROR: {:?}", fn_pubkey, req_pubkey, e);
                                return json_error!(fn_pubkey, req_pubkey, e);
                            }
                        }
                    }
                }))
            }
        }))
        .await
        .unwrap();
}
