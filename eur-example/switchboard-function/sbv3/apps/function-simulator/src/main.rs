#![allow(clippy::large_enum_variant)]

use futures_util::SinkExt;
pub use kv_log_macro::{debug, error, info, trace};
use miette::Result;
pub use serde::{Deserialize, Serialize};
use std::sync::Arc;
pub use switchboard_container_utils::{
    bollard::{self, Docker},
    get_default_docker_config, Config, Container, ContainerError, ContainerManager,
    ContainerResult, DockerContainer, DockerContainerOverrides, DockerManager,
};
use tungstenite::Result as Res;
use warp::{http::StatusCode, Filter};

pub use switchboard_common::SbError;

pub mod args;
pub mod handle;
pub mod msg;
pub mod server;
pub mod utils;

pub use args::*;
pub use msg::*;
pub use utils::*;

pub type WebsocketStream =
    futures_util::stream::SplitSink<warp::filters::ws::WebSocket, warp::filters::ws::Message>;

fn get_log_level() -> femme::LevelFilter {
    match std::env::var("RUST_LOG")
        .unwrap_or("info".to_owned())
        .to_ascii_lowercase()
        .as_str()
    {
        "trace" => femme::LevelFilter::Trace,
        "debug" => femme::LevelFilter::Debug,
        _ => femme::LevelFilter::Info,
    }
}

#[tokio::main]
async fn main() {
    // Access the version
    let sbv3_version = env!("SBV3_VERSION");
    println!("Version: {}", sbv3_version);

    // Set up logging
    femme::with_level(get_log_level());

    // Parse args
    let args: Arc<Args> = Arc::new(Args::parse());
    args.log();

    let manager = Arc::new(DockerManager::new(
        Arc::new(Docker::connect_with_unix_defaults().unwrap()),
        Some(Config {
            ..get_default_docker_config()
        }),
    ));

    let version = manager.get_version().await.unwrap();
    let version_component = version
        .components
        .as_ref()
        .unwrap()
        .first()
        .unwrap()
        .clone();
    println!("Docker Version: {:?}", version_component.version);

    let cors = warp::cors()
        .allow_any_origin()
        .allow_headers(vec![
            "User-Agent",
            "Sec-Fetch-Mode",
            "Referer",
            "Origin",
            "Access-Control-Request-Method",
            "Access-Control-Request-Headers",
            "Content-Type",
        ])
        .allow_methods(vec!["POST", "GET"]);

    let mrenclave_routes_manager = manager.clone();
    let mrenclave_route = warp::post()
        .and(warp::path("mrenclave"))
        .and(warp::body::json::<MsgInMeasurementData>())
        .and_then({
            let manager = mrenclave_routes_manager.clone();
            move |msg: MsgInMeasurementData| {
                let manager = manager.clone();
                async move { get_mrenclave(manager, &msg).await }
            }
        })
        .with(cors);

    let ws_routes_manager = manager.clone();
    let ws_routes_args = args.clone();
    let ws_routes = warp::path::end()
        // The `ws()` filter will prepare the Websocket handshake.
        .and(warp::ws())
        .map(move |ws: warp::ws::Ws| {
            let manager = ws_routes_manager.clone();
            let args = ws_routes_args.clone();
            ws.on_upgrade(move |websocket| server::accept_connection(websocket, manager, args))
        });

    let routes = ws_routes.or(mrenclave_route);

    warp::serve(routes).run(([0, 0, 0, 0], 8080)).await;
}

async fn get_mrenclave(
    manager: Arc<dyn ContainerManager + Send + Sync>,
    msg: &MsgInMeasurementData,
) -> Result<impl warp::Reply, warp::Rejection> {
    let container_version = msg.version.clone().unwrap_or("latest".to_string());
    let container_registry = msg
        .container_registry
        .clone()
        .unwrap_or("dockerhub".to_string());
    let image_name = format!("{}:{}", msg.container, container_version);

    let container = manager
        .create_docker_container(
            &image_name,
            image_name.as_str(),
            None,
            DockerContainerOverrides { entrypoint: None },
        )
        .await
        .unwrap();

    let measurement = container.run_get_measurement().await.unwrap();

    Ok(warp::reply::with_status(
        warp::reply::json(&MsgOutMeasurementData {
            container_registry,
            container: msg.container.clone(),
            version: container_version,
            mr_enclave: measurement,
        }),
        StatusCode::OK,
    ))
}
