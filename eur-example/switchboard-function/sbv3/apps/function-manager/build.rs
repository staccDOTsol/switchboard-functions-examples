use std::env;
use std::fs;
use std::path::Path;

fn main() {
    println!("cargo:include=/usr/include");
    println!("cargo:rustc-link-search=.");
    println!("cargo:rustc-link-search=/usr/lib/x86_64-linux-gnu");
    println!("cargo:rustc-link-lib=ssl");
    println!("cargo:rustc-link-lib=crypto");
    println!("cargo:rerun-if-changed=libevm.a");
    println!("cargo:rerun-if-changed=libgcp.a");
    println!("cargo:rerun-if-changed=libsolana.a");
    // println!("cargo:rerun-if-changed=libstarknet.a");
    // println!("cargo:rerun-if-env-changed=OPTIMISM");
    // if let Ok(optimism) = env::var("OPTIMISM") {
    // if optimism == "1" {
    // println!("cargo:rustc-cfg=feature=\"optimism\"");
    // }
    // }

    // Get the directory containing the Cargo.toml
    let manifest_dir = env::var("CARGO_MANIFEST_DIR").unwrap();
    let version_path = Path::new(&manifest_dir).join("../../version");

    // Read the version from the file
    let version = fs::read_to_string(version_path).expect("Failed to read the version file");

    // Set the version as a compile-time environment variable
    println!("cargo:rustc-env=SBV3_VERSION={}", version.trim());
}
