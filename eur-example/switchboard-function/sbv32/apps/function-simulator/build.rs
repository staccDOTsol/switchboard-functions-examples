use std::env;
use std::fs;
use std::path::Path;

fn main() {
    let sgx_sdk_path = "/opt/intel/sgxsdk";

    println!("cargo:rustc-env=CFLAGS=-Wl,--allow-multiple-definition");

    println!(r"cargo:rustc-link-search=../../rust/sgx-dcap-quoteverify-sys");
    println!(r"cargo:rustc-link-search=../../rust/sgx-dcap-quoteverify-rs");

    println!("cargo:include=/usr/include");
    println!("cargo:rustc-link-search=.");

    println!("cargo:rustc-link-search=native={}/lib64", sgx_sdk_path);
    println!("cargo:include={}/include", sgx_sdk_path);

    println!("cargo:rustc-link-search=/usr/lib/x86_64-linux-gnu");
    println!("cargo:rustc-link-search=native=/usr/lib/x86_64-linux-gnu/");
    println!("cargo:rustc-link-search=/usr/lib/x86_64-linux-musl");
    println!("cargo:rustc-link-lib=ssl");
    println!("cargo:rustc-link-lib=crypto");

    // Get the directory containing the Cargo.toml
    let manifest_dir = env::var("CARGO_MANIFEST_DIR").unwrap();
    let version_path = Path::new(&manifest_dir).join("../../version");

    // Read the version from the file
    let version = fs::read_to_string(version_path).expect("Failed to read the version file");

    // Set the version as a compile-time environment variable
    println!("cargo:rustc-env=SBV3_VERSION={}", version.trim());
}
