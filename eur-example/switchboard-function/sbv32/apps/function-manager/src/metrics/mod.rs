use lazy_static::lazy_static;

use prometheus::{CounterVec, Gauge, GaugeVec, Opts, Registry};

lazy_static! {
    pub static ref REGISTRY: Registry = Registry::new();
    pub static ref FN_CHECK_ROUTINE_COUNTER: CounterVec = CounterVec::new(
        Opts::new(
            "switchboard_function_check_counter",
            "Function check routine counter"
        ),
        &["chain", "chain_id", "queue_key", "oracle_key"]
    )
    .unwrap();
    pub static ref FN_BACKOFF_COUNTER: CounterVec = CounterVec::new(
        Opts::new(
            "switchboard_function_backoff_counter",
            "Function backoff counter"
        ),
        &["chain", "chain_id", "queue_key", "oracle_key"]
    )
    .unwrap();
    pub static ref FN_EXECUTION_STOLEN_COUNTER: CounterVec = CounterVec::new(
        Opts::new(
            "switchboard_function_stolen_execution_counter",
            "Function execution stolen counter"
        ),
        &[
            "chain",
            "chain_id",
            "queue_key",
            "oracle_key",
            "victim_oracle_key",
            "function_key"
        ]
    )
    .unwrap();
    pub static ref REQUEST_COUNTER: CounterVec = CounterVec::new(
        Opts::new(
            "switchboard_function_request_counter",
            "Function TCP request counter"
        ),
        &["chain", "chain_id", "queue_key", "oracle_key", "img_name"]
    )
    .unwrap();
    pub static ref BOOT_COUNTER: CounterVec = CounterVec::new(
        Opts::new(
            "switchboard_function_manager_boot_counter",
            "DIND Boot counter"
        ),
        &["chain", "chain_id", "queue_key", "oracle_key"]
    )
    .unwrap();
    pub static ref NETWORK_CALL_GAUGE: GaugeVec = GaugeVec::new(
        Opts::new(
            "switchboard_function_network_call_gauge",
            "Network Call Counter"
        ),
        &["chain", "chain_id", "queue_key", "oracle_key", "function"]
    )
    .unwrap();
    pub static ref RUNTIME_GAUGE: GaugeVec = GaugeVec::new(
        Opts::new(
            "switchboard_function_runtime_gauge",
            "Function Runtime Gauge"
        ),
        &[
            "chain",
            "chain_id",
            "queue_key",
            "oracle_key",
            "function_key",
            "function_request_key"
        ]
    )
    .unwrap();
    pub static ref FN_ERROR_CODE_GAUGE: GaugeVec = GaugeVec::new(
        Opts::new(
            "switchboard_function_error_code_gauge",
            "Function Runtime Gauge"
        ),
        &[
            "chain",
            "chain_id",
            "queue_key",
            "oracle_key",
            "function_key",
            "function_request_key",
            "code",
        ]
    )
    .unwrap();
    pub static ref UNHANDLED_ERROR_COUNTER: CounterVec = CounterVec::new(
        Opts::new(
            "switchboard_function_unhandled_error_counter",
            "Function unhandled error counter"
        ),
        &[
            "chain",
            "chain_id",
            "queue_key",
            "oracle_key",
            "function_key",
            "function_request_key"
        ]
    )
    .unwrap();
    pub static ref FN_TIMEOUT_COUNTER: CounterVec = CounterVec::new(
        Opts::new(
            "switchboard_function_timeout_counter",
            "Function run timeout counter"
        ),
        &[
            "chain",
            "chain_id",
            "queue_key",
            "oracle_key",
            "function_key"
        ]
    )
    .unwrap();
    pub static ref ORACLE_AVAILABLE_PERMITS_GAUGE: GaugeVec = GaugeVec::new(
        Opts::new("switchboard_oracle_available_permits_gauge", "ph"),
        &["chain", "chain_id", "queue_key", "oracle_key",]
    )
    .unwrap();
    pub static ref QVN_ERROR_REPORT_FAILED_COUNTER: CounterVec = CounterVec::new(
        Opts::new("switchboard_qvn_error_report_failed_counter", "ph"),
        &[
            "chain",
            "chain_id",
            "queue_key",
            "oracle_key",
            "function_key",
            "function_request_key"
        ]
    )
    .unwrap();
    pub static ref ORACLE_IMG_DL_COUNTER: CounterVec = CounterVec::new(
        Opts::new("switchboard_img_dl_counter", "ph"),
        &["chain", "chain_id", "queue_key", "oracle_key", "container",]
    )
    .unwrap();
    pub static ref ORACLE_DL_ROUTINE_LATENCY: GaugeVec = GaugeVec::new(
        Opts::new("switchboard_oracle_dl_routine_latency", "ph"),
        &["chain", "chain_id", "queue_key", "oracle_key",]
    )
    .unwrap();
    pub static ref ORACLE_AWAITER_ROUTINE_LATENCY: GaugeVec = GaugeVec::new(
        Opts::new("switchboard_oracle_awaiter_routine_latency", "ph"),
        &["chain", "chain_id", "queue_key", "oracle_key",]
    )
    .unwrap();
    pub static ref ORACLE_POLLER_LATENCY: GaugeVec = GaugeVec::new(
        Opts::new("switchboard_oracle_poller_routine_latency", "ph"),
        &["chain", "chain_id", "queue_key", "oracle_key",]
    )
    .unwrap();
    pub static ref LATENCY_TRACKER: GaugeVec = GaugeVec::new(
        Opts::new("switchboard_oracle_latency_tracker", "ph"),
        &["chain", "chain_id", "queue_key", "oracle_key", "function_key", "function_request_key"]
    )
    .unwrap();
}

pub async fn init_metrics() {
    prometheus::register(Box::new(FN_CHECK_ROUTINE_COUNTER.clone())).unwrap();
    prometheus::register(Box::new(FN_BACKOFF_COUNTER.clone())).unwrap();
    prometheus::register(Box::new(FN_EXECUTION_STOLEN_COUNTER.clone())).unwrap();
    prometheus::register(Box::new(REQUEST_COUNTER.clone())).unwrap();
    prometheus::register(Box::new(BOOT_COUNTER.clone())).unwrap();
    prometheus::register(Box::new(NETWORK_CALL_GAUGE.clone())).unwrap();
    prometheus::register(Box::new(RUNTIME_GAUGE.clone())).unwrap();
    prometheus::register(Box::new(FN_ERROR_CODE_GAUGE.clone())).unwrap();
    prometheus::register(Box::new(UNHANDLED_ERROR_COUNTER.clone())).unwrap();
    prometheus::register(Box::new(FN_TIMEOUT_COUNTER.clone())).unwrap();
    prometheus::register(Box::new(ORACLE_AVAILABLE_PERMITS_GAUGE.clone())).unwrap();
    prometheus::register(Box::new(QVN_ERROR_REPORT_FAILED_COUNTER.clone())).unwrap();
    prometheus::register(Box::new(ORACLE_IMG_DL_COUNTER.clone())).unwrap();
    prometheus::register(Box::new(ORACLE_DL_ROUTINE_LATENCY.clone())).unwrap();
    prometheus::register(Box::new(ORACLE_AWAITER_ROUTINE_LATENCY.clone())).unwrap();
    prometheus::register(Box::new(ORACLE_POLLER_LATENCY.clone())).unwrap();
    prometheus::register(Box::new(LATENCY_TRACKER.clone())).unwrap();
}

#[macro_export]
macro_rules! label {
    ($metric:expr, $labels:expr) => {{
        let mut chain_id = Env::get().CHAIN_ID.to_string();
        if Env::get().CHAIN == "solana" {
            chain_id = Env::get().CLUSTER.clone();
        }
        // Static labels
        let static_labels = vec![
            &Env::get().CHAIN,
            &chain_id,
            &Env::get().QUEUE,
            &Env::get().QUOTE_KEY,
        ];
        let labels = $labels.to_vec();
        let all_labels = [static_labels, labels].concat();

        // // Concatenate static and provided labels
        // let all_labels: Vec<_> = static_labels.iter().chain($labels.iter()).collect();

        // Convert Vec<&str> to Vec<String> and then to Vec<&str> again
        // to satisfy the lifetime requirements of `with_label_values`
        let all_labels_str: Vec<_> = all_labels.iter().map(|&s| s.as_str()).collect();

        $metric.with_label_values(all_labels_str.as_slice())
    }};
}

pub fn set_max(gauge: &Gauge, value: f64) {
    let current = gauge.get();
    if value > current {
        gauge.set(value);
    }
}
