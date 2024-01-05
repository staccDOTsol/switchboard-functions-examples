use crate::*;
use futures_util::StreamExt;
use serde_json::from_str;
use std::sync::Arc;
use switchboard_container_utils::ContainerManager;
use tokio_tungstenite::tungstenite::Error as Err;
use warp::ws::WebSocket;

pub async fn accept_connection(
    ws: WebSocket,
    manager: Arc<dyn ContainerManager + Send + Sync>,
    args: Arc<Args>,
) {
    if let Err(e) = handle_connection(ws, manager.clone(), args.clone()).await {
        match e {
            Err::ConnectionClosed | Err::Protocol(_) | Err::Utf8 => (),
            err => error!("Error processing connection: {:?}", err),
        }
    }
}

async fn handle_connection(
    ws: WebSocket,
    manager: Arc<dyn ContainerManager + Send + Sync>,
    args: Arc<Args>,
) -> std::result::Result<(), Err> {
    // Split the socket into a sender and receive of messages.
    let (mut user_ws_tx, mut user_ws_rx) = ws.split();

    tokio::spawn(async move {
        while let Some(message_result) = user_ws_rx.next().await {
            match message_result {
                Ok(msg) => {
                    // Handle msg!
                    if let Some(text) = get_msg_text(&msg) {
                        let event: MsgIn = from_str(text).expect("Invalid input data");
                        handle::handle_event(manager.clone(), args.clone(), &mut user_ws_tx, event)
                            .await
                            .unwrap();
                    }
                }
                Err(e) => error!("Error receiving message: {:?}", e),
            }
        }
    });

    Ok(())
}
