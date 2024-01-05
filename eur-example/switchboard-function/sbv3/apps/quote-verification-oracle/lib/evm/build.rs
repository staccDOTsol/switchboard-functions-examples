use std::env;

fn main() {
    println!("cargo:rerun-if-env-changed=OPTIMISM");
    if let Ok(optimism) = env::var("OPTIMISM") {
        if optimism == "1" {
            println!("cargo:rustc-cfg=feature=\"optimism\"");
        }
    }
    println!("cargo:rerun-if-changed=libevm.a");
    println!("cargo:rerun-if-changed=libgcp.a");
    println!("cargo:rerun-if-changed=libsolana.a");
    println!("cargo:rerun-if-changed=libstarknet.a");
}
