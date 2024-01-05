use crate::*;

use crate::run_container_unbounded;

use bollard::container::AttachContainerOptions;
use bollard::container::LogOutput;
use bollard::Docker;
use futures_util::StreamExt;
use regex::Regex;
use reqwest::ClientBuilder;
use reqwest::StatusCode;
use serde::Deserialize;
use serde::Serialize;
use std::result::Result;
use std::sync::Arc;
use std::time::Duration;
use switchboard_common::SbError;
use tokio::sync::mpsc;
use tokio::sync::RwLock;
use tokio::task::JoinHandle;

#[allow(non_snake_case)]
#[derive(Clone)]
pub struct Qvn {
    pub container_id: Arc<RwLock<String>>,
    pub error_counter: Arc<RwLock<i32>>,
    pub start_time: Arc<RwLock<u64>>,
    pub is_ready: Arc<RwLock<bool>>,
    pub is_local: Arc<RwLock<bool>>,
}

#[derive(Serialize, Deserialize, Debug, Default, Clone)]
pub struct QvnResponse {
    pub fn_key: String,
    pub call_key: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signature: Option<String>,
}

impl Qvn {
    pub async fn new(local: bool) -> Self {
        let docker = Docker::connect_with_unix_defaults().unwrap();
        let (tx, mut rx) = mpsc::channel(1);
        let m_docker = docker.clone();
        let mut queue = Env::get().QUEUE.clone();
        if queue.is_empty() {
            queue = std::env::var("QUEUE").unwrap_or(String::new()).clone();
        }
        let mut container_id = String::new();
        if local {
            let name = "switchboardlabs/qvn:latest".to_string();

            maybe_download_layers(docker, name.clone()).await;
            tokio::spawn(async move {
                let container_id = run_container_unbounded(
                    &m_docker,
                    name,
                    vec![
                        format!("WSS_RPC_URL={}", &Env::get().WSS_URL),
                        format!("WSS_URL={}", &Env::get().WSS_URL),
                        format!("CHAIN={}", &Env::get().CHAIN),
                        format!("CHAIN_ID={}", &Env::get().CHAIN_ID),
                        format!("QUOTE_KEY={}", &Env::get().QUOTE_KEY),
                        format!("RPC_URL={}", &Env::get().RPC_URL),
                        format!("QUEUE={}", queue),
                        format!("MODE={}", "FUNCTION_LISTENER"),
                        format!(
                            "HEARTBEAT_INTERVAL={}",
                            &Env::get().HEARTBEAT_INTERVAL.to_string()
                        ),
                        format!("PAYER_SECRET={}", &Env::get().PAYER_SECRET),
                        format!(
                            "GOOGLE_APPLICATION_CREDENTIALS={}",
                            &Env::get().GOOGLE_APPLICATION_CREDENTIALS
                        ),
                        format!(
                            "GOOGLE_PAYER_SECRET_PATH={}",
                            &Env::get().GOOGLE_PAYER_SECRET_PATH
                        ),
                        format!("IPFS_URL={}", &Env::get().IPFS_URL),
                        format!("IPFS_KEY={}", &Env::get().IPFS_KEY),
                        format!("IPFS_SECRET={}", &Env::get().IPFS_SECRET),
                        format!("CONTRACT_ADDRESS={}", &Env::get().CONTRACT_ADDRESS),
                    ],
                    true,
                )
                .await
                .unwrap();
                tx.send(container_id.clone()).await.unwrap();
            });
            container_id = rx.recv().await.unwrap();
        }

        // current time
        let start_time = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();

        Self {
            container_id: Arc::new(RwLock::new(container_id)),
            error_counter: Arc::new(RwLock::new(0)),
            start_time: Arc::new(RwLock::new(start_time)),
            is_ready: Arc::new(RwLock::new(!local)),
            is_local: Arc::new(RwLock::new(local)),
        }
    }

    pub async fn send_result(
        &self,
        fn_result: &switchboard_common::FunctionResult,
    ) -> Result<QvnResponse, SbError> {
        // let fn_key = if let Evm(_) = fn_result.chain_result_info {
        // hex::encode(fn_result.fn_key.clone())
        // } else {
        // fn_result.fn_key.to_base58()
        // };
        let timeout = Duration::new(35, 0);
        let client = ClientBuilder::new().timeout(timeout).build().unwrap();
        let url = if *self.is_local.read().await {
            "http://127.0.0.1:3000"
        } else {
            &Env::get().QVN_URL
        };

        let bytes = serde_json::to_vec(fn_result).unwrap();
        let response = client.post(url).body(bytes).send().await;
        let qvn_ready: bool = *self.is_ready.read().await;
        if response.is_err() {
            // check if 15 seconds have passed since the start of the qvn
            let _start_time = self.start_time.read().await;
            let _now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs();

            let response_err = response.as_ref().err().unwrap();
            if qvn_ready && response_err.is_timeout() {
                println!("QVN AWAIT STOPPED OVER TIMEOUT");
                let mut write_guard = self.error_counter.write().await;
                *write_guard += 1;
                if *write_guard > 5 {
                    std::process::exit(1);
                }
            } else if qvn_ready && response_err.is_connect() {
                println!("QVN AWAIT STOPPED OVER CONNECTION ERROR");
                let mut write_guard = self.error_counter.write().await;
                *write_guard += 1;
                if *write_guard > 20 {
                    std::process::exit(1);
                }
            } else if !qvn_ready {
                println!("Qvn not yet ready");
            } else {
                let response = Regex::new(r"\s+")
                    .unwrap()
                    .replace_all(&response.as_ref().err().unwrap().to_string(), " ")
                    .replace("\n", " ");

                println!("fail-case: {:?}", response);
            }
            // let response = format!("{:?}", &response);
            return Err(SbError::QvnError(Arc::new(
                response.err().unwrap().to_string(),
            )));
        } else {
            let mut write_guard = self.error_counter.write().await;
            *write_guard = 0;
            if !qvn_ready {
                *self.is_ready.write().await = true;
            }
        }
        let response = response.unwrap();
        if response.status() != StatusCode::OK {
            let body = response.text().await.unwrap_or_default().clone();
            println!("fail-case: {:?}", body);
            return Err(SbError::QvnError(Arc::new(body.into())));
        }
        let txt = response.text().await.unwrap_or_default();
        let json = serde_json::from_str(&txt);
        Ok(json.unwrap_or_default())
    }

    pub async fn watch(self: Arc<Self>, docker: Docker) -> Result<JoinHandle<()>, SbError> {
        let docker = docker.clone();
        let container_id = self.container_id.clone();
        let handle = tokio::spawn(async move {
            let is_local = *self.is_local.read().await;
            if !is_local {
                return;
            }
            println!("STARTING QVN WATCHER");
            let attach_options = Some(AttachContainerOptions {
                stdin: Some(true),
                stdout: Some(true),
                stderr: Some(true),
                stream: Some(true),
                logs: Some(true),
                detach_keys: Some("ctrl-c".to_string()),
            });
            let mut attachment = docker
                .attach_container(&container_id.read().await.clone(), attach_options.clone())
                .await
                .unwrap();
            let mut last_line = String::new();
            loop {
                if let Some(Ok(log)) = attachment.output.next().await {
                    let mut fd = "".into();
                    let mut msg = "".into();
                    match log {
                        LogOutput::StdOut { message } => (fd, msg) = ("stdout", message),
                        LogOutput::StdErr { message } => (fd, msg) = ("stderr", message),
                        _ => {
                            println!("UNEXPECTED");
                        }
                    }
                    let msg = String::from_utf8_lossy(&msg);
                    last_line += &msg;
                    if msg.ends_with("\n") {
                        let lines = last_line.split("\n").filter(|s| !s.is_empty());
                        for line in lines {
                            if line.starts_with("[open_se_device") {
                                continue;
                            }
                            if line.starts_with("[get_driver_type") {
                                continue;
                            }
                            println!("{}({}): {}", "QVN", fd, &line);
                            if line.contains("Setup Done") {
                                *self.is_ready.write().await = true;
                            }
                            if line.starts_with("QVN HEARTBEAT FAILURE") {
                                println!("Rebooting QVN");
                                let kill_res =
                                    kill_container(&docker, &*container_id.read().await).await;
                                if kill_res.is_err() {
                                    println!("{:#?}", kill_res);
                                }
                                let new_qvn = Qvn::new(false).await;

                                let container_id = new_qvn.container_id.read().await;
                                let error_counter = new_qvn.error_counter.read().await;
                                let start_time = new_qvn.start_time.read().await;
                                let is_ready = new_qvn.is_ready.read().await;
                                let is_local = new_qvn.is_local.read().await;
                                *self.container_id.write().await = container_id.clone();
                                *self.error_counter.write().await = *error_counter;
                                *self.start_time.write().await = *start_time;
                                *self.is_ready.write().await = *is_ready;
                                *self.is_local.write().await = *is_local;
                                attachment = docker
                                    .attach_container(&container_id.clone(), attach_options.clone())
                                    .await
                                    .unwrap();
                            }
                        }
                        last_line = String::new();
                    }
                } else {
                    println!("QVN EXITED");
                    std::process::exit(1);
                    // break;
                }
            }
        });
        Ok(handle)
    }
}
