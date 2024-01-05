use crate::*;

use switchboard_common::SbError;

use bollard::container::{
    AttachContainerOptions, AttachContainerResults, Config, CreateContainerOptions,
    InspectContainerOptions, KillContainerOptions, ListContainersOptions, LogOutput,
    RemoveContainerOptions,
};

use crate::container_mappings::CONTAINER_ID_TO_IMAGE;

use bollard::auth::DockerCredentials;
use bollard::image::CreateImageOptions;
use bollard::models::{DeviceMapping, Mount, MountTypeEnum, PortBinding};
use bollard::service::HostConfig;
use bollard::Docker;
use futures_util::StreamExt;
use getrandom::getrandom;
use kv_log_macro::info;
use lazy_static::lazy_static;
use std::result::Result;
use std::sync::Arc;
use std::time::{Duration, Instant};
pub use switchboard_common::FunctionResult;
use tokio::select;
use tokio::sync::Semaphore;
use tokio::time::interval;

pub mod container_awaiter;
pub use container_awaiter::*;
pub mod container_downloader;
pub use container_downloader::*;

static PREFIX: &str = "-----------------------------------------------------------------------------------------------------------------------";
static GLOG_1: &str = "Gramine detected the following insecure configurations:";
static GLOG_2: &str =
    "- sys.insecure__allow_eventfd = true         (host-based eventfd is enabled)";
static GLOG_3: &str = "- sgx.allowed_files = [ ... ]                (some files are passed through from untrusted host without verification)";
static GLOG_4: &str = "Gramine will continue application execution, but this configuration must not be used in production!";
static GLOG_5: &str = "Gramine is starting. Parsing TOML manifest file, this may take some time...";
pub static SILENCED_SUBSTRS: [&str; 6] = [PREFIX, GLOG_1, GLOG_2, GLOG_3, GLOG_4, GLOG_5];

// #[path = "../../src/error.rs"]
// pub mod error;
// pub use error::*;

pub mod container_mappings {
    use lazy_static::lazy_static;
    use std::collections::HashMap;
    use std::sync::RwLock;

    lazy_static! {
        pub static ref IP_TO_CONTAINER_ID: RwLock<HashMap<String, String>> =
            RwLock::new(HashMap::new());
        pub static ref CONTAINER_ID_TO_IMAGE: RwLock<HashMap<String, String>> =
            RwLock::new(HashMap::new());
    }
}
lazy_static! {
    static ref SEM: Semaphore = Semaphore::new(1);
}

fn truncate_string(input: &str, max_length: usize) -> String {
    if input.len() > max_length {
        let truncated = &input[..max_length - 3]; // Subtract 3 to account for the added "..."
        format!("{}...", truncated)
    } else {
        input.to_string()
    }
}

pub fn build_config(
    image_name: &str,
    environment: &[String],
    is_qvn: bool,
    memory: i64,
    cpu: f64,
) -> Config<String> {
    let mut mounts = vec![get_mount("/var/run/aesmd/aesm.socket", true)];
    let mut network = "bridge".to_string();
    let mut cpu = (cpu * 10f64.powf(9.0)).floor() as i64;
    let mut memory = memory * 1024 * 1024;
    let mut oom_score = 100;
    let mut disable_oom = true;
    // let mut cpu_shares = 2;

    // make lazy_static
    // TODO: it seems you need to read this in instead of file path?
    // let seccomp = std::fs::read_to_string("/configs/seccomp.json").unwrap();
    let security_opt = vec!["no-new-privileges".to_string()];
    if is_qvn {
        mounts.push(get_mount("/data/protected_files", false));
        // mounts.push(get_mount("/home/credentials", true));
        network = "host".to_string();
        cpu = (0.6 * 10f64.powf(9.0)).floor() as i64;
        memory = memory * 1024 * 1024;
        oom_score = 0;
        disable_oom = true;
        // cpu_shares = 4;
    } else {
        // security_opt.push(format!("seccomp={}", seccomp))
    }
    Config {
        image: Some(image_name.to_string()),
        env: Some(environment.to_vec().clone()),
        open_stdin: Some(true),
        host_config: Some(HostConfig {
            // cpu_shares: Some(cpu_shares),
            // Possibly exposes metrics daemon
            network_mode: Some(network),
            auto_remove: Some(true),
            oom_kill_disable: Some(disable_oom),
            oom_score_adj: Some(oom_score),
            readonly_rootfs: Some(true),
            security_opt: Some(security_opt),
            memory: Some(memory),
            memory_swap: Some(memory),
            nano_cpus: Some(cpu),
            mounts: Some(mounts),
            devices: Some(vec![
                get_device("/dev/sgx_provision", "rw"),
                get_device("/dev/sgx_enclave", "rw"),
            ]),
            ..Default::default()
        }),
        ..Default::default()
    }
}

pub fn get_device(path: &str, p: &str) -> DeviceMapping {
    DeviceMapping {
        path_on_host: Some(String::from(path)),
        path_in_container: Some(String::from(path)),
        cgroup_permissions: Some(p.to_owned()),
    }
}

pub fn get_mount(path: &str, ro: bool) -> Mount {
    Mount {
        target: Some(path.to_owned()),
        source: Some(path.to_owned()),
        typ: Some(MountTypeEnum::BIND),
        read_only: Some(ro),
        ..Default::default()
    }
}

pub fn bind_port(host: &str, port: u32) -> PortBinding {
    PortBinding {
        host_ip: Some(host.to_owned()),
        host_port: Some(port.to_string()),
    }
}

pub async fn kill_all_containers(docker: &Docker) -> Result<(), bollard::errors::Error> {
    let options = Some(ListContainersOptions::<String> {
        all: false,
        ..Default::default()
    });
    let containers = docker.list_containers(options).await?;

    // Kill each running container
    for container in &containers {
        let id = container.id.clone().unwrap();
        let options = Some(KillContainerOptions { signal: "SIGKILL" });
        docker.kill_container(&id, options).await?;
    }

    let options = Some(ListContainersOptions::<String> {
        all: true,
        ..Default::default()
    });
    let containers = docker.list_containers(options).await?;
    let options = Some(RemoveContainerOptions {
        force: true,
        ..Default::default()
    });
    for container in &containers {
        let id = container.id.clone().unwrap();
        docker.remove_container(&id, options).await?;
    }
    Ok::<(), bollard::errors::Error>(())
}

pub async fn kill_container(docker: &Docker, id: &str) -> Result<(), bollard::errors::Error> {
    let options = Some(KillContainerOptions { signal: "SIGKILL" });
    docker.kill_container::<&str>(id, options).await?;
    let options = Some(RemoveContainerOptions {
        force: true,
        ..Default::default()
    });
    docker.remove_container(id, options).await?;
    Ok::<(), bollard::errors::Error>(())
}

pub async fn kill_container_in_secs(
    docker: &Docker,
    fn_key: &String,
    req_keys: &[String],
    img_name: &String,
    secs: u64,
    container_id: String,
) -> Result<FunctionResult, SbError> {
    let mut timeout = interval(Duration::from_secs(secs));
    timeout.tick().await;
    let attach_options = Some(AttachContainerOptions {
        stdin: Some(true),
        stdout: Some(true),
        stderr: Some(true),
        stream: Some(true),
        logs: Some(true),
        detach_keys: Some("ctrl-c".to_string()),
    });
    let AttachContainerResults {
        mut output,
        input: _,
    } = docker
        .attach_container(&container_id, attach_options)
        .await
        .map_err(|_| SbError::AttachError)?;
    let mut last_word = String::new();
    let mut last_line = String::new();
    let mut is_timeout = false;
    loop {
        select! {
            _ = timeout.tick() => {
                label!(FN_TIMEOUT_COUNTER, [fn_key]).inc();
                println!("Container for function {} stopped via timeout", fn_key);
                is_timeout = true;
                break;
            },
            log = output.next() => {
                if log.is_none() {
                    println!("Container {} completed for {}", container_id, fn_key);
                    break;
                }
                let mut fd = "";
                let mut msg = Default::default();
                match log.unwrap() {
                    Ok(LogOutput::StdOut {message}) => (fd, msg) = ("stdout", message),
                    Ok(LogOutput::StdErr {message}) => (fd, msg) = ("stderr", message),
                    _ => {
                        println!("unexpected");
                    },
                }
                if fd.is_empty() {
                    println!("unexpected");
                    continue;
                }
                let msg_str = String::from_utf8_lossy(&msg).to_string();
                last_line += &msg_str;
                if msg_str.ends_with('\n') {
                    let lines = last_line.split('\n').filter(|s| !s.is_empty());
                    for line in lines {
                        if SILENCED_SUBSTRS.iter().any(|&substring| line.contains(substring)) {
                            continue;
                        }
                        // println!("{:?}:{}:({}): {}", fn_key, img_name, fd, truncate_string(line, 500));
                        info!("{}", truncate_string(line, 500), {fn_key: fn_key, req_keys: req_keys.join(","), img: img_name});
                    }
                    let tmp: Vec<_> = last_line.split(' ').filter(|s| !s.is_empty()).collect();
                    if !tmp.is_empty() {
                        last_word = tmp.last().unwrap().to_string();
                    }
                    last_line = String::new();
                }
            },
        }
    }
    if Env::get().DEBUG == 1 {
        let stats = docker.stats(&container_id, None).next().await;
        if stats.as_ref().is_some() && stats.as_ref().unwrap().is_ok() {
            let stats = stats.as_ref().unwrap().as_ref().unwrap();
            let cpu_stats = stats.cpu_stats.clone();
            let cpu_delta =
                cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
            let system_delta = cpu_stats.system_cpu_usage.unwrap_or(0)
                - stats.precpu_stats.system_cpu_usage.unwrap_or(0);

            if system_delta > 0 && cpu_delta > 0 {
                let cpu_percent = (cpu_delta as f64 / system_delta as f64)
                    * cpu_stats.online_cpus.unwrap_or(0) as f64
                    * 100.0;
                println!("{:?} CPU Usage: {}%", fn_key, cpu_percent);
            }
            println!(
                "{:?} stats: memory: {:?}, cpu: {:?}, cpu_throttle: {:?}",
                fn_key,
                stats.memory_stats.max_usage,
                stats.cpu_stats.cpu_usage.total_usage,
                stats.cpu_stats.throttling_data.throttled_time
            );
        }
    }
    docker
        .kill_container::<String>(
            &container_id,
            Some(KillContainerOptions {
                signal: "SIGKILL".to_string(),
            }),
        )
        .await
        .ok();
    if is_timeout {
        return Err(SbError::ContainerTimeout);
    }

    last_word = last_word
        .chars()
        .filter(|c| c.is_ascii_hexdigit())
        .collect();
    let bytes = hex::decode(last_word).map_err(|_| SbError::FunctionResultParseError)?;
    let fn_out = serde_json::from_slice(&bytes).map_err(|e| {
        info!("[Result Parse Error] {:?}", e, {fn_key: fn_key, req_keys: req_keys.join(","), img: img_name});
        SbError::FunctionResultParseError
    })?;
    Ok(fn_out)
}

pub async fn run_container(
    docker: &Docker,
    key: String,
    req_keys: Vec<String>,
    img: String,
    environment: Vec<String>,
    timeout: u64,
) -> Result<FunctionResult, SbError> {
    let start = Instant::now();
    let container_id = run_container_unbounded(docker, img.clone(), environment, false).await?;
    let result =
        kill_container_in_secs(docker, &key, &req_keys, &img, timeout, container_id.clone()).await;
    let _duration = start.elapsed().as_millis() as f64;
    // RUNTIME_GAUGE.with_label_values(&[&Env::get().CHAIN, img.as_str()]).set(duration);

    result
}

pub async fn needs_download(docker: &Docker, img: String) -> bool {
    let credentials = DockerCredentials {
        username: Some(Env::get().DOCKER_USER.clone()),
        password: Some(Env::get().DOCKER_KEY.clone()),
        ..Default::default()
    };

    let img: String = img.chars().filter(|&c| c != '\0').collect();
    let mut stream = docker.create_image(
        Some(CreateImageOptions {
            from_image: img.as_str(),
            ..Default::default()
        }),
        None,
        Some(credentials),
    );
    while let Some(p) = stream.next().await {
        if p.is_ok() {
            return true;
        }
    }
    false
}

pub async fn maybe_download_layers(docker: Docker, img: String) {
    let credentials = DockerCredentials {
        username: Some(Env::get().DOCKER_USER.clone()),
        password: Some(Env::get().DOCKER_KEY.clone()),
        ..Default::default()
    };

    let img: String = img.chars().filter(|&c| c != '\0').collect();
    let mut stream = docker.create_image(
        Some(CreateImageOptions {
            from_image: img.as_str(),
            ..Default::default()
        }),
        None,
        Some(credentials),
    );
    info!("START DOWNLOAD: {:?}", stream.next().await);
    while let Some(Ok(progress)) = stream.next().await {
        println!(
            "{:?} {:?} {:?} {:?}",
            img, progress.id, progress.status, progress.progress
        );
    }
}

pub async fn run_container_unbounded(
    docker: &Docker,
    img: String,
    environment: Vec<String>,
    is_qvn: bool,
) -> Result<String, SbError> {
    let mut split = img.split(':');
    let _image: &str = split.next().unwrap();
    let _tag: &str = split.next().unwrap();
    //    let size = check_size::check_size(image, tag).await.map_err(|_| Err::CheckSizeError)?;
    //    if size > 5242880 { //5242880 == 500mb
    //        return Err(Err::FunctionImageTooBigError);
    //    }

    let img: String = img.chars().filter(|&c| c != '\0').collect();
    // println!("Running {}", img);
    let config = build_config(&img, &environment, is_qvn, 128, 0.2);

    let credentials = DockerCredentials {
        username: Some(Env::get().DOCKER_USER.clone()),
        password: Some(Env::get().DOCKER_KEY.clone()),
        ..Default::default()
    };
    if !is_qvn {
        let _stream = docker.create_image(
            Some(CreateImageOptions {
                from_image: img.as_str(),
                ..Default::default()
            }),
            None,
            Some(credentials),
        );
        // let images = docker.list_images(Some(ListImagesOptions::<String> {
        // all: true,
        // ..Default::default()
        // })).await.map_err(|_| Err::DockerFetchError)?;
        // let image_exists = images.into_iter().any(|image| {
        // image.repo_tags.into_iter().any(|tag| tag == img)
        // });
        // println!("{:?}", images);
        // if !image_exists {
        // while let Some(Ok(progress)) = stream.next().await {
        // println!(
        // "{:?} {:?} {:?} {:?}",
        // img, progress.id, progress.status, progress.progress
        // );
        // }
        // }
    }
    let mut buf = [0u8; 8];
    getrandom(&mut buf).unwrap();
    let container_name = hex::encode(img.clone() + &String::from_utf8_lossy(&buf));
    let options = Some(CreateContainerOptions {
        name: container_name.clone(),
        ..Default::default()
    });
    let result = docker
        .create_container::<String, _>(options, config)
        .await
        .map_err(|e| SbError::ContainerStartError(Arc::new(e)))?;
    // println!("Created container {}", result.id);
    let container_id = result.id;
    docker
        .start_container::<String>(&container_name, None)
        .await
        .map_err(|e| SbError::ContainerStartError(Arc::new(e)))?;
    // match get_container_ip(docker, &container_id).await {
    // Ok(ip_address) => {
    // IP_TO_CONTAINER_ID
    // .write()
    // .unwrap()
    // .insert(ip_address.clone(), container_id.to_string());
    // println!(
    // "The IP address of container_id={} is: {}",
    // container_id, ip_address
    // );
    // }
    // Err(e) => eprintln!("Error: {}", e),
    // }
    CONTAINER_ID_TO_IMAGE
        .write()
        .unwrap()
        .insert(container_id.to_string(), img.to_string());

    Ok(container_id)
}

async fn get_container_ip(
    docker: &Docker,
    container_id: &str,
) -> Result<String, Box<dyn std::error::Error>> {
    let options = Some(InspectContainerOptions { size: false });
    let container = docker.inspect_container(container_id, options).await?;
    let network_settings = container
        .network_settings
        .ok_or("No network settings found for container")?;
    let networks = network_settings
        .networks
        .ok_or("No networks found for container")?;
    let network = networks
        .values()
        .next()
        .ok_or("No networks found for container")?;
    let ip_address = network
        .ip_address
        .clone()
        .ok_or("No IP address found for container")?;
    Ok(ip_address)
}
