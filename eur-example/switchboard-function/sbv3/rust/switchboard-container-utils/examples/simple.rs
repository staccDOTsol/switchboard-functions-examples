use std::sync::Arc;
use switchboard_container_utils::{
    get_default_docker_config, Config, ContainerManager, Docker, DockerManager,
};

#[tokio::main]
async fn main() {
    let container_manager = DockerManager::new(
        Arc::new(Docker::connect_with_unix_defaults().unwrap()),
        Some(Config {
            ..get_default_docker_config()
        }),
    );

    container_manager
        .load_image_from_archive("../../apps/function-manager/files/qvn.tar", false)
        .await
        .unwrap();
}
