use crate::*;

use warp::filters::ws::Message;

pub async fn get_container(
    manager: Arc<dyn ContainerManager + Send + Sync>,
    stream: &mut WebsocketStream,
    container_registry: Option<String>,
    container: String,
    version: Option<String>,
) -> ContainerResult<DockerContainer> {
    let container_version = version.clone().unwrap_or("latest".to_string());
    let container_registry = container_registry
        .clone()
        .unwrap_or("dockerhub".to_string());
    let image_name = format!("{}:{}", container, container_version);

    // ignore this error
    stream_and_log(
        stream,
        format!(
            "Building {} container for image {}",
            container_registry, image_name,
        ),
        &image_name,
    )
    .await;

    let container = manager
        .create_docker_container(
            &image_name,
            image_name.as_str(),
            None,
            DockerContainerOverrides { entrypoint: None },
        )
        .await?;

    Ok(container)
}

pub async fn stream_and_log(stream: &mut WebsocketStream, log: String, id: &str) {
    info!("{}", log, { id: id });
    let _ = stream.send(warp::filters::ws::Message::text(log)).await;
}

pub fn get_msg_text(msg: &Message) -> Option<&str> {
    // match msg.try_into() {
    //     Message::Text(s) => Some(s),
    //     Message::Binary(v) => Some(std::str::from_utf8(v).expect("Invalid UTF8")),
    //     _ => None,
    // }
    msg.to_str().ok()
}

pub trait ToMessage {
    fn to_msg(&self) -> Message;
}

// Easily convert any json-serializable type to a tungstenite Message.
impl<T> ToMessage for T
where
    T: ?Sized + Serialize,
{
    fn to_msg(&self) -> Message {
        Message::text(serde_json::to_string(self).unwrap())
        // Message::Text(serde_json::to_string(self).unwrap()) // TODO: Fix question mark
    }
}
