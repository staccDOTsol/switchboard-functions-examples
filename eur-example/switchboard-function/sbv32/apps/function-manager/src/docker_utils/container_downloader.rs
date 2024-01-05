use crate::*;
use bollard::Docker;
use cached::Cached;
use cached::TimedCache;
use chrono::Utc;
use futures::future::join_all;
use std::collections::HashSet;
use std::time::Duration;
use tokio;
use tokio::sync::mpsc::UnboundedReceiver;
use tokio::time::{interval, Interval, MissedTickBehavior};

pub async fn container_download_routine(docker: Docker, mut rx: UnboundedReceiver<String>) {
    let mut interval: Interval = interval(Duration::from_secs(10));
    interval.set_missed_tick_behavior(MissedTickBehavior::Delay);
    let mut cache = TimedCache::with_lifespan(600);
    while let Some(img) = rx.recv().await {
        let mut imgs = HashSet::new();
        let mut runs = vec![];
        imgs.insert(img);
        while let Ok(img) = rx.try_recv() {
            imgs.insert(img);
        }
        for img in imgs {
            let docker = docker.clone();
            if cache.cache_get(&img).is_some() {
                continue;
            }
            println!("[DOWNLOADER] received task: {}", img.clone());
            label!(ORACLE_IMG_DL_COUNTER, [&img]).inc();
            cache.cache_set(img.clone(), true);
            runs.push(tokio::spawn(maybe_download_layers(docker, img)));
            if runs.len() > 5 {
                let start = Utc::now().timestamp();
                join_all(runs).await;
                let latency = Utc::now().timestamp() - start;
                // Track max download routine latency in this report period
                set_max(&label!(ORACLE_DL_ROUTINE_LATENCY, []), latency as f64);
                runs = vec![];
            }
        }
        let start = Utc::now().timestamp();
        join_all(runs).await;
        let latency = Utc::now().timestamp() - start;
        // Track max download routine latency in this report period
        set_max(&label!(ORACLE_DL_ROUTINE_LATENCY, []), latency as f64);
        interval.tick().await;
    }
}
