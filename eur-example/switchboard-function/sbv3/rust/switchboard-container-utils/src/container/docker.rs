use crate::container::*;
use async_trait::async_trait;
use std::sync::Arc;

#[derive(Clone, Debug)]
pub struct DockerContainer {
    pub id: String,
    pub image_name: String,
    pub env: Vec<String>,
    pub docker: Arc<Docker>,
    pub config: Config<String>,
}

impl DockerContainer {
    pub fn new(
        docker: Arc<Docker>,
        id: String, // TODO: is this the log target or the actual docker container ID?
        image_name: String,
        env: Vec<String>,
        config: Config<String>,
    ) -> Self {
        Self {
            id,
            image_name,
            env,
            docker,
            config,
        }
    }
}

#[async_trait]
impl Container for DockerContainer {
    fn docker(&self) -> &Arc<Docker> {
        &self.docker
    }

    fn id(&self) -> &String {
        &self.id
    }

    fn image_name(&self) -> &String {
        &self.image_name
    }
}
