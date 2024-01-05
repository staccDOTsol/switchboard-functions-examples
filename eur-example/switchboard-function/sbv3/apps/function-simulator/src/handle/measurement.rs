use crate::*;
use std::sync::Arc;

pub async fn handle_measurement(
    manager: Arc<dyn ContainerManager + Send + Sync>,
    stream: &mut WebsocketStream,
    msg: &MsgInMeasurementData,
) -> Res<MsgOutMeasurementData> {
    let container = get_container(
        manager,
        stream,
        msg.container_registry.clone(),
        msg.container.clone(),
        msg.version.clone(),
    )
    .await
    .unwrap();

    let image_name = container
        .config
        .clone()
        .image
        .unwrap_or(msg.container.clone());

    stream_and_log(
        stream,
        "Running get_measurement.sh".to_string(),
        &image_name,
    )
    .await;

    let measurement_exec_result = container
        .run_command(
            vec!["/bin/bash".to_string(), "/get_measurement.sh".to_string()],
            None,
        )
        .await
        .unwrap_or_default();
    stream_and_log(stream, measurement_exec_result, &image_name).await;

    stream_and_log(
        stream,
        format!("Fetching measurement for container {}", image_name),
        &image_name,
    )
    .await;

    let measurement = container.fetch_measurement().await.unwrap();
    stream_and_log(
        stream,
        format!("Measurement for {} = {}", image_name, measurement),
        &image_name,
    )
    .await;

    let _ = container.remove().await;

    Ok(MsgOutMeasurementData {
        container_registry: msg
            .container_registry
            .clone()
            .unwrap_or("dockerhub".to_string()),
        container: msg.container.clone(),
        version: msg.version.clone().unwrap_or("latest".to_string()),
        mr_enclave: measurement,
    })
}
