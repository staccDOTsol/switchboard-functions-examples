use crate::*;

use async_trait::async_trait;
use bollard::{
    container::{
        AttachContainerOptions, AttachContainerResults, DownloadFromContainerOptions,
        InspectContainerOptions, KillContainerOptions, LogOutput, RemoveContainerOptions,
        RestartContainerOptions,
    },
    exec::{CreateExecOptions, StartExecOptions},
    Docker,
};
use futures_util::StreamExt;
use std::future::Future;
use std::marker::Send;
use std::sync::Arc;
use std::time::Duration;
use switchboard_common::FunctionResult;
use tokio::io::AsyncReadExt;
use tokio::select;
use tokio::time::interval;
use tokio_tar::Archive;
use tokio_util::io::StreamReader;

mod docker;
pub use docker::*;

mod qvn;
pub use qvn::*;

#[derive(Clone, Debug, Default)]
pub struct DockerContainerOverrides {
    pub entrypoint: Option<Vec<String>>,
}

/////////////////////////////////////////////////////////////////////////////////////////////
// TRAIT DEFINITION
/////////////////////////////////////////////////////////////////////////////////////////////

#[async_trait]
pub trait Container {
    fn docker(&self) -> &std::sync::Arc<Docker>;

    fn id(&self) -> &String;

    fn image_name(&self) -> &String;

    async fn remove(&self) -> ContainerResult<()> {
        self.docker()
            .kill_container::<&str>(self.id(), Some(KillContainerOptions { signal: "SIGKILL" }))
            .await
            .map_err(handle_bollard_error)?;

        self.docker()
            .remove_container(
                self.id(),
                Some(RemoveContainerOptions {
                    force: true,
                    ..Default::default()
                }),
            )
            .await
            .map_err(handle_bollard_error)?;

        Ok(())
    }

    async fn restart(&self) -> ContainerResult<()> {
        self.docker()
            .restart_container(self.id(), None::<RestartContainerOptions>)
            .await
            .map_err(handle_bollard_error)?;

        Ok(())
    }

    async fn kill(&self, remove: bool) -> ContainerResult<()> {
        self.docker()
            .kill_container::<&str>(self.id(), Some(KillContainerOptions { signal: "SIGKILL" }))
            .await
            .map_err(handle_bollard_error)?;

        if remove {
            self.docker()
                .remove_container(
                    self.id(),
                    Some(RemoveContainerOptions {
                        force: true,
                        ..Default::default()
                    }),
                )
                .await
                .map_err(handle_bollard_error)?;
        }

        Ok(())
    }

    async fn start_container(&self) -> ContainerResult<()> {
        self.docker()
            .start_container::<String>(self.id().clone().as_str(), None)
            .await
            .map_err(|e| SbError::ContainerStartError(Arc::new(e)))?;

        info!("Started container {}", self.image_name(), { id: self.id() });

        Ok(())
    }

    async fn run_and_decode<F, Fut>(
        &self,
        timeout_secs: Option<u64>,
        on_log: F,
    ) -> ContainerResult<FunctionResult>
    where
        F: Fn(String) -> Fut + Send + Sync,
        Fut: Future<Output = ()> + Send,
    {
        self.start_container().await?;

        let logs = self.attach_and_collect_logs(timeout_secs, on_log).await?;

        find_fn_result(&logs)
    }

    async fn run<F, Fut>(&self, timeout_secs: Option<u64>, on_log: F) -> ContainerResult<String>
    where
        F: Fn(String) -> Fut + Send + Sync,
        Fut: Future<Output = ()> + Send,
    {
        self.start_container().await?;
        self.attach_and_collect_logs(timeout_secs, on_log).await
    }

    async fn run_command<F, Fut>(
        &self,
        cmd: Vec<String>,
        timeout_secs: Option<u64>,
        on_log: F,
    ) -> ContainerResult<String>
    where
        F: Fn(String) -> Fut + Send + Sync,
        Fut: Future<Output = ()> + Send,
    {
        let exec = self
            .docker()
            .create_exec(
                self.id(),
                CreateExecOptions {
                    cmd: Some(cmd),
                    attach_stdout: Some(true),
                    ..Default::default()
                },
            )
            .await
            .map_err(|e| SbError::ContainerCreateError(Arc::new(e)))?;

        let _ = self
            .docker()
            .start_exec(
                &exec.id,
                Some(StartExecOptions {
                    detach: true,
                    output_capacity: Some(usize::MAX),
                }),
            )
            .await
            .map_err(|e| SbError::ContainerStartError(Arc::new(e)))?;

        self.attach_and_collect_logs(timeout_secs, on_log).await
    }

    async fn attach_and_collect_logs<F, Fut>(
        &self,
        timeout_secs: Option<u64>,
        on_log: F,
    ) -> ContainerResult<String>
    where
        F: Fn(String) -> Fut + Send + Sync,
        Fut: Future<Output = ()> + Send,
    {
        // let start = unix_timestamp();
        let mut timeout = interval(Duration::from_secs(timeout_secs.unwrap_or(30)));
        timeout.tick().await;

        let AttachContainerResults {
            mut output,
            input: _,
        } = self
            .docker()
            .attach_container(
                self.id(),
                Some(AttachContainerOptions {
                    stdin: Some(true),
                    stdout: Some(true),
                    stderr: Some(true),
                    stream: Some(true),
                    logs: Some(true),
                    detach_keys: Some("ctrl-c".to_string()),
                }),
            )
            .await
            .map_err(|e| SbError::ContainerStartError(Arc::new(e)))?;

        let mut container_logs = String::new();

        let mut line_buffer = String::new();

        loop {
            select! {
                _ = timeout.tick() => {
                    debug!("Exec {} stopped", self.image_name(), { id: self.id() });
                    return Err(SbError::ContainerTimeout);
                },
                new_log = output.next() => {
                    if new_log.is_none() {
                        debug!("Container {} completed", self.image_name(),  { id: self.id() });
                        break;
                    }
                    let mut fd = "";
                    let mut msg = Default::default();
                    match new_log.unwrap() {
                        Ok(LogOutput::StdOut {message}) => (fd, msg) = ("stdout", message),
                        Ok(LogOutput::StdErr {message}) => (fd, msg) = ("stderr", message),
                        _ => {
                            warn!("unexpected", { id: self.id() });
                        },
                    }
                    if fd.is_empty() {
                        warn!("unexpected",  { id: self.id() });
                        continue;
                    }
                    for byte in &msg {
                        if *byte == b'\n' {
                            on_log(line_buffer.clone()).await;
                            line_buffer.clear();
                        } else {
                            line_buffer.push(*byte as char);
                        }
                    }
                    let msg_str = String::from_utf8_lossy(&msg).to_string();
                    container_logs += msg_str.as_str();
                },
            }
        }
        if !line_buffer.is_empty() {
            on_log(line_buffer.clone()).await;
        }

        Ok(container_logs.trim().to_string())
    }

    async fn fetch_file(&self, path: &str) -> ContainerResult<String> {
        // TODO: parse path and verify it is a file and not a directory

        let stream = self
            .docker()
            .download_from_container(self.id(), Some(DownloadFromContainerOptions { path }));

        // Convert the stream into an AsyncRead
        let async_read = StreamReader::new(
            stream.map(|res| res.map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))),
        );

        // Unarchive the tar
        let mut archive = Archive::new(async_read);

        // Look for the file in the stream of entries
        let mut file_contents: String = String::new();
        while let Some(entry) = archive.entries()?.next().await {
            let mut entry = entry?;
            entry.read_to_string(&mut file_contents).await?;
            // break;
        }

        Ok(file_contents.trim().to_string())
    }

    // Gets the file at /measurement.txt. DOES NOT GET THE ACTUAL MEASUREMENT
    async fn fetch_measurement(&self) -> ContainerResult<String> {
        let stream = self.docker().download_from_container(
            self.id(),
            Some(DownloadFromContainerOptions {
                path: "/measurement.txt",
            }),
        );

        // Convert the stream into an AsyncRead
        let async_read = StreamReader::new(
            stream.map(|res| res.map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))),
        );

        // Unarchive the tar
        let mut archive = Archive::new(async_read);

        // Look for the 'measurement.txt' file in the stream of entries
        let mut file_contents: String = String::new();
        while let Some(entry) = archive.entries()?.next().await {
            let mut entry = entry?;
            if entry.path()?.ends_with("measurement.txt") {
                entry.read_to_string(&mut file_contents).await?;
                break;
            }
        }

        Ok(file_contents.trim().to_string())
    }

    async fn run_get_measurement(&self) -> ContainerResult<String> {
        self.run_command(
            vec!["/bin/bash".to_string(), "/get_measurement.sh".to_string()],
            None,
            |_| async move {},
        )
        .await
        .unwrap_or_default();

        let measurement = self.fetch_measurement().await.unwrap_or_default();

        Ok(measurement)
    }

    async fn get_ip_address(&self) -> ContainerResult<String> {
        let options = Some(InspectContainerOptions { size: false });
        let container = self
            .docker()
            .inspect_container(self.id(), options)
            .await
            .map_err(handle_bollard_error)?;
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
}
