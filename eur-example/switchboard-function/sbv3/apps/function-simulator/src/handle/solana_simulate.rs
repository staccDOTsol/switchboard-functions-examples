use crate::*;

use std::sync::Arc;
use switchboard_common::FunctionResult;
use switchboard_container_utils::{bollard::container::StartContainerOptions, DockerContainer};
use switchboard_solana::Cluster;

// pub async fn run_container_and_stream_logs(
//     stream: &mut WebSocketStream<TcpStream>,
//     container: &DockerContainer,
//     options: Option<StartContainerOptions<String>>,
// ) -> ContainerResult<Vec<String>> {
//     // start container
//     container
//         .docker
//         .start_container(&container.id, options)
//         .await?;

//     // stream and capture logs
//     let mut logs: Vec<String> = Vec::new();
//     let mut docker_stream = container.docker.logs(
//         &container.id,
//         Some(LogsOptions {
//             follow: true,
//             stdout: true,
//             stderr: true,
//             ..Default::default()
//         } as LogsOptions<String>),
//     );
//     while let Some(Ok(log)) = docker_stream.next().await {
//         let log_message: String = match log {
//             LogOutput::Console { message } => String::from_utf8_lossy(&message).to_string(),
//             LogOutput::StdOut { message } => String::from_utf8_lossy(&message).to_string(),
//             LogOutput::StdErr { message } => String::from_utf8_lossy(&message).to_string(),
//             _ => "".to_string(),
//         };
//         if !log_message.is_empty() {
//             logs.push(log_message.clone());
//             stream.send(tungstenite::Message::Text(log_message)).await?;
//         }
//     }

//     Ok(logs)
// }

pub async fn run_container_and_capture_logs(
    stream: &mut WebsocketStream,
    container: &DockerContainer,
    options: Option<StartContainerOptions<String>>,
) -> ContainerResult<Vec<String>> {
    // start container
    // container
    //     .docker
    //     .start_container(&container.id, options)
    //     .await?;

    container
        .docker
        .start_container(&container.id, options)
        .await?;

    let _ = stream_and_log(
        stream,
        format!("Started container {}", container.image_name),
        &container.id,
    )
    .await;

    let ip_address = container.get_ip_address().await?;
    info!("Container IP address: {}", ip_address, { id: container.id });

    let logs = container.attach_and_collect_logs(None).await?;
    let _ = stream_and_log(stream, logs.clone(), &container.id).await;

    let result: Vec<String> = logs
        .split('\n') // Split the string by the newline character
        .filter(|&line| !line.is_empty()) // Filter out empty lines
        .map(|line| line.to_string()) // Convert &str to String
        .collect(); // Collect the results into a Vec<String>

    Ok(result)

    // // stream and capture logs
    // let mut logs: Vec<String> = Vec::new();
    // let mut docker_stream = container.docker.logs(
    //     &container.id,
    //     Some(LogsOptions {
    //         follow: true,
    //         stdout: true,
    //         stderr: true,
    //         ..Default::default()
    //     } as LogsOptions<String>),
    // );
    // while let Some(msg) = docker_stream.next().await {
    //     match msg {
    //         Ok(log_output) => match log_output {
    //             LogOutput::Console { message } => {
    //                 logs.push(String::from_utf8_lossy(&message).to_string())
    //             }
    //             LogOutput::StdOut { message } => {
    //                 logs.push(String::from_utf8_lossy(&message).to_string())
    //             }
    //             LogOutput::StdErr { message } => {
    //                 logs.push(String::from_utf8_lossy(&message).to_string())
    //             }
    //             _ => (),
    //         },
    //         Err(e) => {
    //             stream_and_log(
    //                 stream,
    //                 format!("Failed to read logs {:?}", e),
    //                 &container.id,
    //             )
    //             .await;
    //         }
    //     }
    // }

    // Ok(logs)
}

pub async fn handle_solana_simulate(
    manager: Arc<dyn ContainerManager + Send + Sync>,
    args: Arc<Args>,
    stream: &mut WebsocketStream,
    msg: &MsgInSolanaSimulateData,
) -> ContainerResult<MsgOutSolanaSimulateData> {
    let id = msg.fn_key.clone();

    let cluster = msg.cluster.clone();
    let rpc_url = match cluster {
        Cluster::Devnet => args.solana_devnet_rpc_url.clone(),
        _ => args.solana_mainnet_rpc_url.clone(),
    };

    let config_result = msg.validate(rpc_url).await;
    if let Err(error) = config_result {
        return Ok(MsgOutSolanaSimulateData {
            fn_key: id,
            image_name: "".to_string(),
            result: None,
            error: Some(format!(
                "[VALIDATION ERROR] failed to parse environment variables, {:?}",
                error
            )),
            logs: None,
        });
    }
    let config = config_result.unwrap();

    let env = config.env.to_env();

    stream_and_log(
        stream,
        format!(
            "Building {} container for image {}",
            config.container_registry.clone(),
            config.image_name.clone(),
        ),
        &id,
    )
    .await;

    // Create the container
    let container = manager
        .create_docker_container(
            id.as_str(),
            &config.image_name,
            Some(env.clone()),
            switchboard_container_utils::DockerContainerOverrides { entrypoint: None },
        )
        .await?;

    stream_and_log(stream, "Starting container ...".to_owned(), &id).await;

    // start container with new entrypoint and overwrite with --test
    let logs = run_container_and_capture_logs(stream, &container, None).await?;

    if logs.is_empty() {
        stream_and_log(stream, "No logs found.".to_owned(), &id).await;
        return Ok(MsgOutSolanaSimulateData {
            fn_key: id.clone(),
            image_name: config.image_name.clone(),
            result: None,
            error: Some("failed to yield any logs or results".to_string()),
            logs: Some(logs),
        });
    }

    if let Some(fn_out_result) = find_last_match(&logs) {
        match FunctionResult::decode(fn_out_result.as_str()) {
            Ok(fn_result) => {
                return Ok(MsgOutSolanaSimulateData {
                    fn_key: id.clone(),
                    image_name: config.image_name.clone(),
                    result: serde_json::to_string(&fn_result).ok(),
                    error: None,
                    logs: Some(logs.clone()),
                });
            }
            Err(error) => {
                info!("Failed to decode the log {}", error, { id: id })
            }
        }
    }

    let _ = container.remove().await;

    Ok(MsgOutSolanaSimulateData {
        fn_key: id.clone(),
        image_name: config.image_name,
        result: None,
        error: Some("Failed to find the FN_OUT result in the emitted logs".to_string()),
        logs: Some(logs.clone()),
    })
}

fn find_last_match(data: &[String]) -> Option<String> {
    let mut result = None;
    let mut buffer = String::new();
    let mut collecting = false;

    for s in data.iter() {
        if s.starts_with("FN_OUT: ") {
            buffer.clear();
            collecting = true;
        }
        if collecting {
            buffer.push_str(s.trim());
        }
    }

    if !buffer.is_empty() {
        result = Some(buffer);
    }

    result
}
