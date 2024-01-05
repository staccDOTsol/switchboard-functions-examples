use prometheus::{CounterVec, GaugeVec, Opts, Registry};
use std::sync::OnceLock;

// A static variable representing the different node metrics to collect
pub static SWITCHBOARD_METRICS: OnceLock<SwitchboardMetrics> = OnceLock::new();

#[derive(Debug, Clone)]
pub struct SwitchboardMetrics {
    pub registry: Registry,
    pub fn_backoff_counter: CounterVec,
    pub fn_execution_stolen_counter: CounterVec,
    pub request_counter: CounterVec,
    pub boot_counter: CounterVec,
    pub network_call_gauge: GaugeVec,
    pub runtime_gauge: GaugeVec,
    pub fn_error_code_gauge: GaugeVec,
    pub unhandled_error_counter: CounterVec,
    pub fn_timeout_counter: CounterVec,
    pub oracle_available_permits_gauge: GaugeVec,
    pub qvn_error_report_failed_counter: CounterVec,
    pub oracle_img_dl_counter: CounterVec,
    pub oracle_dl_routine_latency: GaugeVec,
    pub oracle_awaiter_routine_latency: GaugeVec,
    pub oracle_poller_latency: GaugeVec,
}

impl SwitchboardMetrics {
    pub fn get_or_init() -> &'static Self {
        SWITCHBOARD_METRICS.get_or_init(SwitchboardMetrics::initialize)
    }

    pub fn initialize() -> Self {
        let registry = Registry::new();

        let fn_backoff_counter = CounterVec::new(
            Opts::new(
                "switchboard_function_backoff_counter",
                "Function backoff counter",
            ),
            &["chain", "chain_id", "queue_key", "oracle_key"],
        )
        .unwrap();
        prometheus::register(Box::new(fn_backoff_counter.clone())).unwrap();

        let fn_execution_stolen_counter = CounterVec::new(
            Opts::new(
                "switchboard_function_stolen_execution_counter",
                "Function execution stolen counter",
            ),
            &[
                "chain",
                "chain_id",
                "queue_key",
                "oracle_key",
                "victim_oracle_key",
                "function_key",
            ],
        )
        .unwrap();
        prometheus::register(Box::new(fn_execution_stolen_counter.clone())).unwrap();

        let request_counter = CounterVec::new(
            Opts::new(
                "switchboard_function_request_counter",
                "Function TCP request counter",
            ),
            &["chain", "chain_id", "queue_key", "oracle_key", "img_name"],
        )
        .unwrap();
        prometheus::register(Box::new(request_counter.clone())).unwrap();

        let boot_counter = CounterVec::new(
            Opts::new(
                "switchboard_function_manager_boot_counter",
                "DIND Boot counter",
            ),
            &["chain", "chain_id", "queue_key", "oracle_key"],
        )
        .unwrap();
        prometheus::register(Box::new(boot_counter.clone())).unwrap();

        let network_call_gauge = GaugeVec::new(
            Opts::new(
                "switchboard_function_network_call_gauge",
                "Network Call Counter",
            ),
            &["chain", "chain_id", "queue_key", "oracle_key", "function"],
        )
        .unwrap();
        prometheus::register(Box::new(network_call_gauge.clone())).unwrap();

        let runtime_gauge = GaugeVec::new(
            Opts::new(
                "switchboard_function_runtime_gauge",
                "Function Runtime Gauge",
            ),
            &[
                "chain",
                "chain_id",
                "queue_key",
                "oracle_key",
                "function_key",
                "function_request_key",
            ],
        )
        .unwrap();
        prometheus::register(Box::new(runtime_gauge.clone())).unwrap();

        let fn_error_code_gauge = GaugeVec::new(
            Opts::new(
                "switchboard_function_error_code_gauge",
                "Function Runtime Gauge",
            ),
            &[
                "chain",
                "chain_id",
                "queue_key",
                "oracle_key",
                "function_key",
                "function_request_key",
                "code",
            ],
        )
        .unwrap();
        prometheus::register(Box::new(fn_error_code_gauge.clone())).unwrap();

        let unhandled_error_counter = CounterVec::new(
            Opts::new(
                "switchboard_function_unhandled_error_counter",
                "Function unhandled error counter",
            ),
            &[
                "chain",
                "chain_id",
                "queue_key",
                "oracle_key",
                "function_key",
                "function_request_key",
            ],
        )
        .unwrap();
        prometheus::register(Box::new(unhandled_error_counter.clone())).unwrap();

        let fn_timeout_counter = CounterVec::new(
            Opts::new(
                "switchboard_function_timeout_counter",
                "Function run timeout counter",
            ),
            &[
                "chain",
                "chain_id",
                "queue_key",
                "oracle_key",
                "function_key",
            ],
        )
        .unwrap();
        prometheus::register(Box::new(fn_timeout_counter.clone())).unwrap();

        let oracle_available_permits_gauge = GaugeVec::new(
            Opts::new("switchboard_oracle_available_permits_gauge", "ph"),
            &["chain", "chain_id", "queue_key", "oracle_key"],
        )
        .unwrap();
        prometheus::register(Box::new(oracle_available_permits_gauge.clone())).unwrap();

        let qvn_error_report_failed_counter = CounterVec::new(
            Opts::new("switchboard_qvn_error_report_failed_counter", "ph"),
            &[
                "chain",
                "chain_id",
                "queue_key",
                "oracle_key",
                "function_key",
                "function_request_key",
            ],
        )
        .unwrap();
        prometheus::register(Box::new(qvn_error_report_failed_counter.clone())).unwrap();

        let oracle_img_dl_counter = CounterVec::new(
            Opts::new("switchboard_img_dl_counter", "ph"),
            &["chain", "chain_id", "queue_key", "oracle_key", "container"],
        )
        .unwrap();
        prometheus::register(Box::new(oracle_img_dl_counter.clone())).unwrap();

        let oracle_dl_routine_latency = GaugeVec::new(
            Opts::new("switchboard_oracle_dl_routine_latency", "ph"),
            &["chain", "chain_id", "queue_key", "oracle_key"],
        )
        .unwrap();
        prometheus::register(Box::new(oracle_dl_routine_latency.clone())).unwrap();

        let oracle_awaiter_routine_latency = GaugeVec::new(
            Opts::new("switchboard_oracle_awaiter_routine_latency", "ph"),
            &["chain", "chain_id", "queue_key", "oracle_key"],
        )
        .unwrap();
        prometheus::register(Box::new(oracle_awaiter_routine_latency.clone())).unwrap();

        let oracle_poller_latency = GaugeVec::new(
            Opts::new("switchboard_oracle_poller_routine_latency", "ph"),
            &["chain", "chain_id", "queue_key", "oracle_key"],
        )
        .unwrap();
        prometheus::register(Box::new(oracle_poller_latency.clone())).unwrap();

        SwitchboardMetrics {
            registry,
            fn_backoff_counter,
            fn_execution_stolen_counter,
            request_counter,
            boot_counter,
            network_call_gauge,
            runtime_gauge,
            fn_error_code_gauge,
            unhandled_error_counter,
            fn_timeout_counter,
            oracle_available_permits_gauge,
            qvn_error_report_failed_counter,
            oracle_img_dl_counter,
            oracle_dl_routine_latency,
            oracle_awaiter_routine_latency,
            oracle_poller_latency,
        }
    }

    // TODO: add set_max methods for gauges
}

// TODO: add label! macro

// #[cfg(test)]
// mod tests {
//     use super::*;

//     #[test]
//     fn it_works() {
//         let result = 2 + 2;
//         assert_eq!(result, 4);
//     }
// }
