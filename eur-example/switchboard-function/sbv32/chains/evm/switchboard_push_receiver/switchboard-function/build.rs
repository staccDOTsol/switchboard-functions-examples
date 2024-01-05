fn main() {
    println!("cargo:rerun-if-env-changed=SWITCHBOARD_PUSH_ADDRESS");
    // Read the environment variable
    let value =
        std::env::var("SWITCHBOARD_PUSH_ADDRESS").expect("SWITCHBOARD_PUSH_ADDRESS must be set");

    // Pass it to the Rust compiler
    println!("cargo:rustc-env=SWITCHBOARD_PUSH_ADDRESS={}", value);
}
