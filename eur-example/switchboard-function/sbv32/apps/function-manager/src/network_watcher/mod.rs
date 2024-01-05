use crate::*;

use prometheus::CounterVec;
use std::collections::HashMap;
use std::env;
use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};

use crate::container_mappings::{CONTAINER_ID_TO_IMAGE, IP_TO_CONTAINER_ID};

pub async fn init_network_watcher(
    request_counter: CounterVec,
    sender: async_channel::Sender<String>,
) {
    let mut container_id_request_counter: HashMap<String, u64> = HashMap::new();
    let mut chain: String = "undefined".to_string();
    match env::var("CHAIN") {
        Ok(value) => chain = value,
        Err(e) => println!("Couldn't read chain env var CHAIN: {}", e),
    }

    let tcpdump = Command::new("sudo")
        .args(&["tcpdump", "-i", "docker0", "-q", "-l", "-w", "-"])
        .stdout(Stdio::piped())
        .spawn()
        .expect("Failed to start tcpdump");
    let tshark = Command::new("tshark")
        .args(&[
            "-i",
            "-",
            "-Y",
            "http.request or tls.handshake.type == 1",
            "-T",
            "fields",
            "-e",
            "ip.src",
            "-l",
            "-e",
            "ip.dst",
        ])
        .stdin(tcpdump.stdout.unwrap())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .expect("Failed to start tshark");
    let reader = BufReader::new(tshark.stdout.unwrap());

    for line in reader.lines() {
        if let Ok(line) = line {
            let parts: Vec<&str> = line.split('\t').collect();
            if parts.len() >= 2 {
                let first_ip = parts[0];
                println!("Source IP address: {}", first_ip);
                let container_id = {
                    let map = IP_TO_CONTAINER_ID.read().unwrap();
                    map.get(first_ip).cloned()
                };
                match container_id {
                    Some(container_id) => {
                        println!("Request from container ID/IP {}/{}", first_ip, container_id);
                        {
                            *container_id_request_counter
                                .entry(container_id.to_string())
                                .or_insert(0) += 1;
                            if container_id_request_counter[&container_id] > 6 {
                                sender.send(container_id.to_string()).await.unwrap();
                            }
                        }
                        let image = {
                            let map = CONTAINER_ID_TO_IMAGE.read().unwrap();
                            map.get(first_ip).cloned()
                        };
                        match image {
                            Some(image) => {
                                label!(request_counter, [&image]).inc();
                            }
                            None => println!("No image found for container ID {}", container_id),
                        }
                    }
                    None => println!("No container ID found for IP {}", first_ip),
                }
            }
        }
    }
}
