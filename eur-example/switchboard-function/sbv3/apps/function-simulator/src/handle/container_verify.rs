use crate::*;
use std::sync::Arc;

pub async fn handle_container_verify(
    manager: Arc<dyn ContainerManager + Send + Sync>,
    stream: &mut WebsocketStream,
    msg: &MsgInContainerVerifyData,
) -> Res<MsgOutContainerVerifyData> {
    let container = get_container(
        manager,
        stream,
        msg.container_registry.clone(),
        msg.container.clone(),
        msg.version.clone(),
    )
    .await;

    let is_valid = container.is_ok();

    if let Err(err) = container {
        stream_and_log(
            stream,
            format!("Failed to build container: {:?}", err,),
            &msg.container,
        )
        .await;
    } else {
        let container = container.unwrap();
        stream_and_log(
            stream,
            format!("container created - {}", container.id),
            &msg.container,
        )
        .await;
        let _ = container.remove().await;
    }

    Ok(MsgOutContainerVerifyData {
        container_registry: msg
            .container_registry
            .clone()
            .unwrap_or("dockerhub".to_string()),
        container: msg.container.clone(),
        version: msg.version.clone().unwrap_or("latest".to_string()),
        is_valid,
    })
}
