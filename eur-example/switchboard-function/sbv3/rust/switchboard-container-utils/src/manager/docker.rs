use crate::manager::*;
use async_trait::async_trait;
use std::sync::Arc;

/// DockerManager provides utilities for managing a set of docker containers.
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
#[derive(Clone, Debug)]
pub struct DockerManager {
    pub docker: Arc<Docker>,
    // We store the default config so a simulation runner can override the entrypoint for all containers easier
    pub docker_default_config: Config<String>,
    pub docker_credentials: DockerCredentials,
}

impl DockerManager {
    pub fn new(docker: Arc<Docker>, default_docker_config: Option<Config<String>>) -> Self {
        Self {
            docker,
            docker_credentials: DockerCredentials {
                username: Some(std::env::var("DOCKER_USER").unwrap_or(String::new())),
                password: Some(std::env::var("DOCKER_KEY").unwrap_or(String::new())),
                ..Default::default()
            },
            docker_default_config: default_docker_config.unwrap_or(get_default_docker_config()),
        }
    }
}

#[async_trait]
impl ContainerManager for DockerManager {
    fn docker(&self) -> &Arc<Docker> {
        &self.docker
    }

    fn docker_credentials(&self) -> &DockerCredentials {
        &self.docker_credentials
    }

    fn docker_default_config(&self) -> &Config<String> {
        &self.docker_default_config
    }
}
