use crate::*;

use futures::future::join_all;
use switchboard_common::unix_timestamp;
use tokio::sync::mpsc::UnboundedReceiver;

pub async fn container_awaiter_routine<T: futures_util::Future>(mut rx: UnboundedReceiver<T>) {
    while let Some(fut) = rx.recv().await {
        println!("[AWAITER] received task");

        let mut future_vec = vec![];
        future_vec.push(fut);
        while let Ok(fut) = rx.try_recv() {
            future_vec.push(fut);
        }
        println!("[AWAITER] len={}", future_vec.len());

        let start = unix_timestamp();

        join_all(future_vec).await;

        let latency = unix_timestamp() - start;
        println!("[AWAITER] latency = {}", latency);

        set_max(&label!(ORACLE_AWAITER_ROUTINE_LATENCY, []), latency as f64);
    }
}
