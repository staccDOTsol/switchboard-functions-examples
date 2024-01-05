use crate::*;

use crate::anchor_lang::Event;
use base64;
use base64::{engine::general_purpose, Engine as _};
use futures::StreamExt;

use solana_client::rpc_config::RpcTransactionLogsFilter;
use solana_sdk::commitment_config::CommitmentConfig;

use regex::Regex;
use std::future::Future;
use switchboard_solana::solana_client::nonblocking::pubsub_client::PubsubClient;
use switchboard_solana::solana_client::rpc_config::RpcTransactionLogsConfig;

fn extract_program_enter(text: &str) -> Option<String> {
    let re = Regex::new(r"Program ([A-Za-z0-9]+) invoke.*").unwrap();
    re.captures(text)
        .and_then(|caps| caps.get(1).map(|match_| match_.as_str().to_string()))
}

fn extract_program_exit(text: &str) -> Option<String> {
    let re = Regex::new(r"Program [A-Za-z0-9]+ consumed (.*)").unwrap();
    re.captures(text)
        .and_then(|caps| caps.get(1).map(|match_| match_.as_str().to_string()))
}

pub async fn subscribe<E, F, T>(program_id: Pubkey, url: &str, f: F)
where
    F: Fn(E) -> T + Send + Sync + 'static,
    T: Future<Output = ()> + Send + 'static,
    E: Event,
{
    // TODO: This may pull events from other programs if targeted but the
    // request still goes through verification so not a fatal issue.
    loop {
        let pubsub_client = PubsubClient::new(url).await.unwrap();
        let res = pubsub_client
            .logs_subscribe(
                RpcTransactionLogsFilter::Mentions(vec![program_id.to_string()]),
                RpcTransactionLogsConfig {
                    commitment: Some(CommitmentConfig::processed()),
                },
            )
            .await;
        if res.is_err() {
            println!("ERROR Subscription failure");
            continue;
        }
        let (mut r, _handler) = res.unwrap();
        // let mut ctxs: Vec<String> = vec![];
        while let Some(event) = r.next().await {
            for line in event.value.logs {
                // if let Some(pid) = extract_program_enter(&line) {
                // ctxs.push(Pubkey::from_str(&pid).unwrap());
                // }
                // if let Some(_pid) = extract_program_exit(&line) {
                // ctxs.pop();
                // }
                // if ctxs.last() != Some(&program_id) {
                // continue;
                // }
                for w in line.split(' ') {
                    let decoded = general_purpose::STANDARD.decode(w);
                    if decoded.is_err() {
                        continue;
                    }
                    let decoded = decoded.unwrap();
                    if decoded.len() < 8 {
                        continue;
                    }
                    if decoded[..8] != E::DISCRIMINATOR {
                        continue;
                    }
                    println!("DISCRIMINATOR_MATCH");
                    let event = E::try_from_slice(&decoded[8..]);
                    if event.is_ok() {
                        println!("EVENT_PARSE_SUCCESS");
                        f(event.unwrap()).await;
                    } else {
                        println!("EVENT_PARSE_FAILURE");
                    }
                }
            }
        }
    }
}
