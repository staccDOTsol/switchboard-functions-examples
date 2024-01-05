use crate::*;

use async_trait::async_trait;
use bollard::service::{ContainerSummary, ImageInspect};
use futures_util::StreamExt;
use hyper::body::Body;
use std::sync::Arc;
use tokio::fs::File;
use tokio_util::codec::{BytesCodec, FramedRead};

mod capacity;
pub use capacity::*;

mod docker;
pub use docker::*;

mod backoff;
pub use backoff::*;

// mod qvn_manager;
// pub use qvn_manager::*;

pub use bollard::{
    auth::DockerCredentials,
    container::{
        Config, CreateContainerOptions, DownloadFromContainerOptions, KillContainerOptions,
        ListContainersOptions, LogOutput, LogsOptions, PruneContainersOptions,
        RemoveContainerOptions, StartContainerOptions,
    },
    image::{CreateImageOptions, ImportImageOptions, ListImagesOptions, PruneImagesOptions},
    service::{
        AuthConfig, CreateImageInfo, HostConfig, Mount, RestartPolicy, RestartPolicyNameEnum,
    },
    system::Version,
    Docker,
};

/////////////////////////////////////////////////////////////////////////////////////////////
// TRAIT DEFINITION
/////////////////////////////////////////////////////////////////////////////////////////////

/// This ContainerManager trait provides utilities for managing a set of docker containers.
/// It includes functions for creating, starting, stopping, and removing containers,
/// as well as querying their status and retrieving their logs.
///
/// # Examples
///
/// ```
/// use std::sync::Arc;
/// use bollard::Docker;
/// use bollard::container::Config;
/// use switchboard_container_utils::get_default_docker_config;
/// use switchboard_container_utils::manager::{ContainerManager, DockerManager};
///
/// let manager = Arc::new(DockerManager::new(
///     Arc::new(Docker::connect_with_unix_defaults().unwrap()),
///     Some(Config {
///         ..get_default_docker_config()
///     }),
/// ));
/// ```
#[async_trait]
pub trait ContainerManager {
    fn docker(&self) -> &std::sync::Arc<Docker>;

    fn docker_credentials(&self) -> &DockerCredentials;

    fn docker_default_config(&self) -> &Config<String>;

    /// Asynchronously gets the version of Docker being used by the manager.
    ///
    /// # Errors
    ///
    /// Returns a `ContainerError` if there was an issue fetching the Docker version.
    ///
    /// # Returns
    ///
    /// Returns a `Version` struct containing information about the Docker version.
    async fn get_version(&self) -> ContainerResult<Version> {
        let result = self
            .docker()
            .version()
            .await
            .map_err(handle_bollard_error)?;
        Ok(result)
    }

    fn get_container_config(
        &self,
        image_name: &str,
        env: Option<Vec<String>>,
        overrides: DockerContainerOverrides,
    ) -> Config<String> {
        let default_config = self.docker_default_config().clone();
        let default_host_config = default_config.host_config.unwrap_or_default();
        let restart_policy = default_host_config
            .clone()
            .restart_policy
            .unwrap_or(RestartPolicy {
                name: Some(RestartPolicyNameEnum::NO),
                maximum_retry_count: None,
            });

        Config {
            image: Some(image_name.to_string()),
            entrypoint: overrides.entrypoint,
            env,
            host_config: Some(HostConfig {
                restart_policy: Some(restart_policy),
                ..default_host_config
            }),
            ..default_config
        }
    }

    async fn get_image_size(&self, image: &str, tag: Option<&str>) -> ContainerResult<u64> {
        let image_name = format!("{}:{}", image, tag.unwrap_or("latest"));
        let image_info = self
            .docker()
            .inspect_image(&image_name)
            .await
            .map_err(handle_bollard_error)?;

        if let Some(size) = image_info.size {
            let size_result = size.try_into();
            if let Ok(size) = size_result {
                return Ok(size);
            }
        }

        Err(SbError::ContainerErrorMessage(format!(
            "Failed to get size for image {}",
            image_name
        )))
    }

    async fn load_image_from_archive(&self, filepath: &str, quiet: bool) -> ContainerResult<()> {
        let archive = File::open(filepath)
            .await
            .map_err(|e| ContainerError::Message(format!("could not open archive, {}", e)))
            .unwrap();
        let stream = FramedRead::new(archive, BytesCodec::new());
        let body = Body::wrap_stream(stream);

        let mut import_image_stream =
            self.docker()
                .import_image(ImportImageOptions { quiet }, body, None);

        while let Some(msg) = import_image_stream.next().await {
            println!("[import]: {msg:?}");
        }

        Ok(())
    }

    async fn fetch_image(&self, image_name: &str) -> ContainerResult<bool> {
        let (_image_name_without_version, mut image_version) = match image_name.split_once(':') {
            Some((left, right)) => (left, right),
            None => (image_name, ""),
        };

        if image_version.is_empty() {
            image_version = "latest";
        }

        let mut was_downloaded = false;

        let mut create_img_stream = self.docker().create_image(
            Some(CreateImageOptions {
                from_image: image_name.to_string(),
                platform: "linux/amd64".to_string(),
                tag: image_version.to_string(),
                ..Default::default()
            }),
            None,
            Some(self.docker_credentials().clone()),
        );
        while let Some(Ok(progress)) = create_img_stream.next().await {
            was_downloaded = true;
            trace!(
                "{:?} {:?} {:?} {:?}",
                image_name,
                progress.id,
                progress.status,
                progress.progress,
                { id: image_name }
            );
        }

        Ok(was_downloaded)
    }

    async fn inspect_image(&self, image_name: &str) -> ContainerResult<ImageInspect> {
        self.fetch_image(image_name).await?;

        self.docker()
            .inspect_image(image_name)
            .await
            .map_err(handle_bollard_error)
    }

    async fn create_docker_container(
        &self,
        key: &str,
        image_name: &str,
        env: Option<Vec<String>>,
        overrides: Option<DockerContainerOverrides>,
        custom_config: Option<Config<String>>,
    ) -> ContainerResult<DockerContainer> {
        let env = env.unwrap_or_default();

        let config =
            self.get_container_config(image_name, Some(env.clone()), overrides.unwrap_or_default());

        let mut create_img_stream = self.docker().create_image(
            Some(CreateImageOptions {
                from_image: image_name.to_string(),
                platform: "linux/amd64".to_string(),
                ..Default::default()
            }),
            None,
            Some(self.docker_credentials().clone()),
        );
        while let Some(Ok(progress)) = create_img_stream.next().await {
            trace!(
                "{:?} {:?} {:?} {:?}",
                image_name,
                progress.id,
                progress.status,
                progress.progress,
                { id: key }
            );
        }

        match self
            .docker()
            .create_container::<String, _>(
                Some(CreateContainerOptions {
                    ..Default::default()
                }),
                custom_config.unwrap_or(config.clone()),
            )
            .await
        {
            Ok(result) => {
                info!("Created container for image {} ({})", image_name, result.id, { id: key });
                // println!("[DOCKER ENV] {:#?}", env.clone());

                Ok(DockerContainer {
                    id: result.id,
                    image_name: image_name.to_string(),
                    env: env.clone(),
                    docker: self.docker().clone(),
                    config: config.clone(),
                })
            }
            Err(error) => {
                info!("Failed to create container for image {}, {}", image_name, error, { id: key });

                Err(SbError::ContainerCreateError(Arc::new(error)))
            }
        }
    }

    async fn prune_container(&self, id: String) -> ContainerResult<String> {
        self.docker()
            .kill_container::<&str>(&id, Some(KillContainerOptions { signal: "SIGKILL" }))
            .await
            .map_err(handle_bollard_error)?;

        self.docker()
            .remove_container(
                &id,
                Some(RemoveContainerOptions {
                    force: true,
                    ..Default::default()
                }),
            )
            .await
            .map_err(handle_bollard_error)?;

        Ok(id)
    }

    async fn prune_containers(&self, until: &str) {
        let mut filters = std::collections::HashMap::new();
        filters.insert("until", vec![until]);

        let result = self
            .docker()
            .prune_containers(Some(PruneContainersOptions { filters }))
            .await;

        if let Ok(result) = result {
            for container in result.containers_deleted.unwrap_or_default() {
                info!("deleted container {}", container, { id: "prune" });
            }

            if let Some(space_reclaimed) = result.space_reclaimed {
                if space_reclaimed > 0 {
                    info!("[CONTAINERS] space_reclaimed: {:?}", format_bytes(space_reclaimed as f64), { id: "prune" });
                }
            }
        }
    }

    async fn prune_images(&self, until: &str) {
        let mut filters = std::collections::HashMap::new();
        filters.insert("until", vec![until]);
        filters.insert(
            "label!",
            vec![
                "name=switchboardlabs/sgx-function",
                "name=switchboardlabs/qvn",
                "name=gramine",
            ],
        );

        let result = self
            .docker()
            .prune_images(Some(PruneImagesOptions { filters }))
            .await;

        if let Ok(result) = result {
            if let Some(space_reclaimed) = result.space_reclaimed {
                if space_reclaimed > 0 {
                    info!("[IMAGES] space_reclaimed: {:?}", format_bytes(space_reclaimed as f64), { id: "prune" });
                }
            }
        }
    }

    /// Asynchronously retrieves a vector of active container summaries.
    ///
    /// # Errors
    ///
    /// Returns a `ContainerError` if there was an error retrieving the active containers.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use std::error::Error;
    /// # use std::sync::Arc;
    /// # use bollard::Docker;
    /// # use bollard::container::Config;
    /// # use switchboard_container_utils::get_default_docker_config;
    /// # use switchboard_container_utils::manager::{ContainerManager, DockerManager};
    /// #
    /// # #[tokio::main]
    /// # async fn main() -> Result<(), Box<dyn Error>> {
    /// #    let manager = Arc::new(DockerManager::new(
    /// #       Arc::new(Docker::connect_with_unix_defaults().unwrap()),
    /// #       Some(Config {
    /// #           ..get_default_docker_config()
    /// #       }),
    /// #    ));
    /// #
    /// #     let active_containers = manager.get_active_containers().await?;
    /// #
    /// #     Ok(())
    /// # }
    /// ```
    async fn get_active_containers(&self) -> ContainerResult<Vec<ContainerSummary>> {
        let mut filters = std::collections::HashMap::new();
        filters.insert("status", vec!["running", "restarting"]);

        let options = Some(ListContainersOptions {
            all: true,
            filters,
            ..Default::default()
        });

        self.docker()
            .list_containers(options)
            .await
            .map_err(handle_bollard_error)
    }
}
