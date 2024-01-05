rm -rf Cargo.toml
cd lib/evm
cargo build -j $(nproc) --release &
cd ../..
cd lib/solana
cargo build -j $(nproc) --release &
# cd ../..
# cd lib/starknet
# cargo build -j $(nproc) --release &
cd ../..
cd lib/gcp
cargo build -j $(nproc) --release &
cd ../..
cp Cargo.toml.template Cargo.toml
cargo fetch &
wait
cargo build -j $(nproc) --release
rm Cargo.toml

if [[ "$1" == "enclave" ]]; then
  gramine-manifest /app/configs/qvn.manifest.template > /app/qvn.manifest
  gramine-sgx-gen-private-key -f
  gramine-sgx-sign --manifest qvn.manifest --output qvn.manifest.sgx
fi
