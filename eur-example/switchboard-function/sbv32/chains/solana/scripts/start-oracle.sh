#!/bin/bash

WORKING_DIR=$(pwd)
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
PROJECT_DIR=$(dirname "$SCRIPT_DIR")

# exit when any command fails
set -e

program_id=$(solana-keygen pubkey "$PROJECT_DIR/target/deploy/switchboard_v2-keypair.json")
payer_keypair_path="$HOME/.config/solana/id.json"
payer_pubkey=$(solana-keygen pubkey "$payer_keypair_path")
oracle_pubkey=$(jq -r '.oracles[0].publicKey' "$SCRIPT_DIR/networks/default.schema.json")

echo "oracle pubkey: ${oracle_pubkey}"

SOLANA_FS_PAYER_SECRET_PATH="$payer_keypair_path" \
CHAIN="solana" \
SOLANA_CLUSTER="localnet" \
RPC_URL="http://0.0.0.0:8899" \
TASK_RUNNER_SOLANA_RPC="https://api.mainnet-beta.solana.com" \
ORACLE_KEY="$oracle_pubkey" \
DISABLE_NONCE_QUEUE=0 \
NONCE_QUEUE_SIZE=1500 \
VERBOSE=1 DEBUG=1 \
ts-node ../../switchboard-oracle-v2/node/src/apps/oracle