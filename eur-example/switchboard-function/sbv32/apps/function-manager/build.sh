set -e
rm -rf Cargo.toml
cd lib/solana
cargo build -j $(nproc) --release
cd ../..
cd lib/evm
cargo build -j $(nproc) --release
cd ../..
cd lib/starknet
cargo build -j $(nproc) --release
cd ../..
cd lib/gcp
cargo build -j $(nproc) --release
cd ../..
cp Cargo.toml.template Cargo.toml
cargo fetch 
wait
cargo build -j $(nproc) --release
rm Cargo.toml

