use crate::manager::*;
use async_trait::async_trait;
use std::{
    collections::HashSet,
    sync::{Arc, Mutex},
};

#[derive(Clone, Debug)]
pub struct ContainerManagerWithCapacity {
    pub max_active_containers: u32,
    pub num_active_containers: u32,
    pub containers: Arc<Mutex<HashSet<String>>>,

    pub docker: Arc<Docker>,
    pub docker_default_config: Config<String>,
    pub docker_credentials: DockerCredentials,
}

impl ContainerManagerWithCapacity {
    pub fn new(docker: Arc<Docker>, default_docker_config: Option<Config<String>>) -> Self {
        Self {
            max_active_containers: 1000,
            num_active_containers: 0,
            containers: Arc::new(Mutex::new(HashSet::new())),

            docker,
            docker_credentials: DockerCredentials {
                username: Some(std::env::var("DOCKER_USER").unwrap_or(String::new())),
                password: Some(std::env::var("DOCKER_KEY").unwrap_or(String::new())),
                ..Default::default()
            },
            docker_default_config: default_docker_config.unwrap_or(get_default_docker_config()),
        }
    }

    pub fn add_container(&mut self, id: &str) -> ContainerResult<()> {
        let mut container_set = self.containers.lock().unwrap();
        if container_set.insert(id.to_string()) {
            self.num_active_containers += 1;
            // TODO: should we error _here_ if this spils over max_active_containers? or just block new containers after this?
        }

        Ok(())
    }

    pub fn remove_container(&mut self, id: &str) -> ContainerResult<()> {
        let mut container_set = self.containers.lock().unwrap();
        if container_set.remove(&id.to_string()) {
            self.num_active_containers -= 1;
        }

        Ok(())
    }

    pub async fn update_active_containers(&mut self) {
        match self.get_active_containers().await {
            Ok(containers) => {
                let num_active_containers = containers.len();
                self.num_active_containers = num_active_containers as u32;

                let mut container_set = self.containers.lock().unwrap();
                *container_set = containers
                    .into_iter()
                    .map(|c| c.id.unwrap_or_default())
                    .filter(|c| !c.is_empty())
                    .collect();
            }
            Err(error) => {
                warn!("Failed to get active containers: {}", error);
            }
        }
    }
}

#[async_trait]
impl ContainerManager for ContainerManagerWithCapacity {
    fn docker(&self) -> &Arc<Docker> {
        &self.docker
    }

    fn docker_credentials(&self) -> &DockerCredentials {
        &self.docker_credentials
    }

    fn docker_default_config(&self) -> &Config<String> {
        &self.docker_default_config
    }

    async fn create_docker_container(
        &self,
        key: &str,
        image_name: &str,
        env: Option<Vec<String>>,
        overrides: Option<DockerContainerOverrides>,
        custom_config: Option<Config<String>>,
    ) -> ContainerResult<DockerContainer> {
        // Verify there is capacity
        if self.containers.lock().unwrap().len() >= (self.max_active_containers as usize) {
            return Err(SbError::CustomMessage(format!(
                "Max active containers reached: {}",
                self.max_active_containers
            )));
        }
        ContainerManager::create_docker_container(
            self,
            key,
            image_name,
            env,
            overrides,
            custom_config,
        )
        .await
    }
}
