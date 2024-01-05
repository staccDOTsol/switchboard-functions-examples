use crate::*;

use crate::container::*;
use async_trait::async_trait;
use hyper::client::HttpConnector;
use hyper::{body::to_bytes, Body, Client, Method, Request, StatusCode, Uri};
use hyper_timeout::TimeoutConnector;
use regex::Regex;
use std::str::FromStr;
use std::sync::Arc;
use std::time::Duration;
use switchboard_common::ChainResultInfo::Evm;
use tokio::sync::RwLock;
use tokio::task::JoinHandle;

#[derive(Clone, Debug)]
pub struct QvnContainer {
    pub container: Arc<DockerContainer>,
    pub error_counter: Arc<RwLock<i32>>,
    pub start_time: Arc<RwLock<u64>>,
    pub is_ready: Arc<RwLock<bool>>,
    pub addr: Uri,

    client: Client<TimeoutConnector<HttpConnector>>,
}

#[async_trait]
impl Container for QvnContainer {
    fn docker(&self) -> &Arc<Docker> {
        &self.container.docker
    }

    fn id(&self) -> &String {
        &self.container.id
    }

    fn image_name(&self) -> &String {
        &self.container.image_name
    }
}

impl QvnContainer {
    pub fn new(
        docker: Arc<Docker>,
        image_name: String,
        env: Vec<String>, // TODO: update to QvnEnvironment struct
        config: Config<String>,
        addr: Option<String>,
    ) -> Self {
        let container = Arc::new(DockerContainer::new(
            docker.clone(),
            "qvn".to_string(),
            image_name,
            env,
            config,
        ));

        let start_time = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();

        // TODO: should we setup a local docker network or bind to host?
        let uri = Uri::from_str(&addr.unwrap_or("http://127.0.0.1:3000".to_string())).unwrap();

        // We should only create the client once so we can re-use connections and
        // improve IO performance.
        let h = HttpConnector::new();
        let mut timeout_connector = TimeoutConnector::new(h);
        timeout_connector.set_connect_timeout(Some(Duration::from_secs(5)));
        timeout_connector.set_read_timeout(Some(Duration::from_secs(5)));
        timeout_connector.set_write_timeout(Some(Duration::from_secs(5)));
        let client = Client::builder().build::<_, hyper::Body>(timeout_connector);

        Self {
            container,
            error_counter: Arc::new(RwLock::new(0)),
            start_time: Arc::new(RwLock::new(start_time)),
            is_ready: Arc::new(RwLock::new(false)),
            addr: uri,
            client,
        }
    }

    pub async fn create(
        docker: bollard::Docker,
        image_name: &str,
        qvn_env: Vec<String>,
        default_docker_config: Option<Config<String>>,
    ) -> ContainerResult<Self> {
        let container_config = default_docker_config.unwrap_or(get_default_docker_config());
        let qvn_config = get_default_qvn_config(
            image_name,
            qvn_env.clone(),
            Some(container_config.clone()),
            None,
        );

        // First, remove all QVN containers
        // TODO: we can filter by ancestor, image qvn too
        let mut filters = std::collections::HashMap::new();
        filters.insert("name", vec!["qvn"]);
        let options = Some(ListContainersOptions {
            all: true,
            filters,
            ..Default::default()
        });

        if let Ok(qvn_containers) = docker.list_containers(options).await {
            for qvn_container in qvn_containers.iter() {
                let container_id = qvn_container.id.clone().unwrap_or_default();
                if container_id.is_empty() {
                    continue;
                }

                // Kill the container if its running
                if qvn_container.status.is_some()
                    && qvn_container.status.clone().unwrap() == "running"
                {
                    docker
                        .kill_container(
                            &container_id,
                            Some(KillContainerOptions { signal: "SIGKILL" }),
                        )
                        .await
                        .unwrap_or_else(|e| {
                            error!("Failed to kill QVN container {}: {}", container_id, e);
                        });
                }

                // Remove the container
                docker
                    .remove_container(&container_id, None::<RemoveContainerOptions>)
                    .await
                    .unwrap_or_else(|e| {
                        error!("Failed to remove QVN container {}: {}", container_id, e);
                    });
            }
        }

        match docker
            .create_container::<String, _>(
                Some(CreateContainerOptions {
                    name: "qvn".to_string(),
                    ..Default::default()
                }),
                qvn_config.clone(),
            )
            .await
        {
            Ok(result) => {
                info!("Created QVN container {}", result.id, { id: "qvn" });

                Ok(QvnContainer::new(
                    Arc::new(docker),
                    image_name.to_string(),
                    qvn_env,
                    qvn_config,
                    None,
                ))
            }
            Err(error) => {
                let error_message = format!("Failed to create QVN container, {}", error);
                error!("{}", error_message, { id: "qvn" });

                Err(SbError::CustomMessage(error_message))
            }
        }
    }

    pub async fn send_result(&self, fn_result: &FunctionResult) -> ContainerResult<()> {
        let fn_key = if let Evm(_) = fn_result.chain_result_info().unwrap() {
            hex::encode(fn_result.fn_key().unwrap())
        } else {
            bs58::encode(fn_result.fn_key().unwrap()).into_string()
        };

        let request = Request::builder()
            .method(Method::POST)
            .uri(self.addr.clone())
            .body(Body::from(serde_json::to_vec(fn_result).unwrap()))
            .expect("failed to build QVN request");

        let response = self.client.request(request).await;

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
                    .replace_all(&response.err().unwrap().to_string(), " ")
                    .replace('\n', " ");

                println!("{}: fail-case1: {:#?}", fn_key, response);
            }
            return Err("QVN encountered an error".into());
        } else {
            let mut write_guard = self.error_counter.write().await;
            *write_guard = 0;
            if !qvn_ready {
                *self.is_ready.write().await = true;
            }
        }
        let response = response.unwrap();
        if response.status() != StatusCode::OK {
            // Read the body
            let bytes = to_bytes(response.into_body())
                .await
                .map_err(|e| SbError::CustomError {
                    message: "Failed to send QVN result".to_string(),
                    source: std::sync::Arc::new(e),
                })?;
            let error_str = String::from_utf8_lossy(&bytes);

            println!("{} fail-case2: {:#?}", fn_key, error_str);
            return Err("QVN encountered an error".into());
        }
        Ok(())
    }

    pub async fn watch(self: Arc<Self>) -> ContainerResult<JoinHandle<()>> {
        let container_id = self.container.id().clone();
        let handle = tokio::spawn(async move {
            println!("STARTING QVN WATCHER");
            let attach_options = Some(AttachContainerOptions {
                stdin: Some(true),
                stdout: Some(true),
                stderr: Some(true),
                stream: Some(true),
                logs: Some(true),
                detach_keys: Some("ctrl-c".to_string()),
            });
            let mut attachment = self
                .docker()
                .attach_container(&container_id, attach_options.clone())
                .await
                .unwrap();
            let mut last_line = String::new();
            loop {
                if let Some(Ok(log)) = attachment.output.next().await {
                    let mut fd = "";
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
                    if msg.ends_with('\n') {
                        let lines = last_line.split('\n').filter(|s| !s.is_empty());
                        for line in lines {
                            if line.starts_with("[open_se_device") {
                                continue;
                            }
                            if line.starts_with("[get_driver_type") {
                                continue;
                            }
                            println!("QVN({}): {}", fd, &line);
                            if line.starts_with("QVN HEARTBEAT FAILURE") {
                                println!("Rebooting QVN");
                                *self.is_ready.write().await = false;
                                let kill_res = self.restart().await;
                                if kill_res.is_err() {
                                    println!("{:#?}", kill_res);
                                } else {
                                    *self.is_ready.write().await = true;
                                }
                                *self.start_time.write().await = std::time::SystemTime::now()
                                    .duration_since(std::time::UNIX_EPOCH)
                                    .unwrap()
                                    .as_secs();

                                attachment = self
                                    .docker()
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
