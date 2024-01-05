use crate::ContainerResult;
use regex::Regex;
use std::time::{SystemTime, UNIX_EPOCH};
use switchboard_common::FunctionResult;

pub fn unix_timestamp() -> u64 {
    let now = SystemTime::now();
    if let Ok(since_the_epoch) = now.duration_since(UNIX_EPOCH) {
        since_the_epoch.as_secs()
    } else {
        0
    }
}

pub fn truncate_string(input: &str, max_length: usize) -> String {
    if input.len() > max_length {
        let truncated = &input[..max_length - 3]; // Subtract 3 to account for the added "..."
        format!("{}...", truncated)
    } else {
        input.to_string()
    }
}

pub fn format_bytes(bytes: f64) -> String {
    const KB: f64 = 1024.0;
    const MB: f64 = KB * KB;
    const GB: f64 = MB * KB;
    const TB: f64 = GB * KB;

    if bytes < KB {
        format!("{} B", bytes)
    } else if bytes < MB {
        format!("{:.2} KB", bytes / KB)
    } else if bytes < GB {
        format!("{:.2} MB", bytes / MB)
    } else if bytes < TB {
        format!("{:.2} GB", bytes / GB)
    } else {
        format!("{:.2} TB", bytes / TB)
    }
}

static PREFIX: &str =
    "-----------------------------------------------------------------------------------------------------------------------";
static GLOG_1: &str = "Gramine detected the following insecure configurations:";
static GLOG_2: &str =
    "- sys.insecure__allow_eventfd = true         (host-based eventfd is enabled)";
static GLOG_3: &str =
    "- sgx.allowed_files = [ ... ]                (some files are passed through from untrusted host without verification)";
static GLOG_4: &str =
    "Gramine will continue application execution, but this configuration must not be used in production!";
static SILENCED_SUBSTRS: [&str; 5] = [PREFIX, GLOG_1, GLOG_2, GLOG_3, GLOG_4];

pub fn parse_gramine_logs(logs: &str) -> String {
    // let mut result = logs;
    // for &substring in SILENCED_SUBSTRS.iter() {
    //     result = result.replace(substring, "");
    // }
    // result

    let pattern = SILENCED_SUBSTRS
        .iter()
        .map(|&s| regex::escape(s))
        .collect::<Vec<_>>()
        .join("|");

    let re = Regex::new(&pattern).unwrap();
    re.replace_all(logs, "").to_string()
}

pub fn find_fn_result(logs: &str) -> ContainerResult<FunctionResult> {
    if logs.is_empty() {
        return Err(switchboard_common::SbError::FunctionResultParseError);
    }
    // {
    // let logs: Vec<String> = logs
    // .split('\n')
    // .map(|s| s.to_string())
    // .filter(|s| !s.starts_with("FN_OUT"))
    // .collect();
    // println!("[DOCKER] {:#?}", logs);
    // }
    let last_line = logs.trim_end().split('\n').last().unwrap();

    // let last_word: String = last_line
    //     .chars()
    //     .filter(|c| c.is_ascii_hexdigit() || c.is_alphabetic())
    //     .collect();
    FunctionResult::decode(last_line)
        .map_err(|_| switchboard_common::SbError::FunctionResultParseError)
}

/// Find all lines in the logs that start with "FN_OUT: "
pub fn find_all_fn_out_lines(text: &str) -> Vec<&str> {
    let re = regex::Regex::new(r"(?m)^FN_OUT: [0-9a-fA-F]+.*").unwrap();
    re.captures_iter(text)
        .map(|cap| cap.get(0).map_or("", |m| m.as_str()))
        .collect()
}
