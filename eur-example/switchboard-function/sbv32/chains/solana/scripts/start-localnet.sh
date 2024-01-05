#!/bin/bash

# We need to start the localnet with the IDL deployed so the oracle can listen for events

WORKING_DIR=$(pwd)
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
PROJECT_DIR=$(dirname "$SCRIPT_DIR")

# exit when any command fails
set -e

program_id=$(solana-keygen pubkey "$PROJECT_DIR/target/deploy/switchboard_v2-keypair.json")
payer_keypair_path="$HOME/.config/solana/id.json"
payer_pubkey=$(solana-keygen pubkey "$payer_keypair_path")

function kill_local_validator {
     # Check if the solana-test-validator process is running
    if pgrep -x "solana-test-validator" > /dev/null
    then
        # If the process is running, kill it
        pkill -x "solana-test-validator"
        wait $! 2>/dev/null
        echo "solana-test-validator process was running and has been killed."
    else
        # If the process is not running, print a message
        echo "solana-test-validator process was not running."
    fi

    # Loop through the process IDs and kill each process
    for pid in $(lsof -t -i :8899 -c solana-test-validator); do
        kill "$pid"
    done
}

function start_localnet() {
    kill_local_validator
    devnet_features=$(scfsd -c mainnet -k -t)
    solana-test-validator -q -r --ledger .anchor/test-ledger --mint "$payer_pubkey" ${devnet_features} &
    # --bpf-program "$program_id" "$PROJECT_DIR/target/deploy/switchboard_v2.so"

    for attempt in {1..30}; do 
        sleep 1;
        if curl -sS http://0.0.0.0:8899 -X POST -H 'Content-Type: application/json' -d '{\"jsonrpc\":\"2.0\",\"id\":1, \"method\":\"getBlockHeight\"}'; then 
            echo ready; break; 
        fi; 
    done
}

anchor_ver=$(anchor --version | cut -d' ' -f2-)

avm use 0.24.2 # need IDL without doc comments
anchor build

echo "Starting solana localnet ..."
start_localnet
echo "Solana localnet initialized"

anchor deploy --provider.cluster localnet --provider.wallet "$payer_keypair_path"

avm use 0.26.0  # why can we only deploy this IDL on later anchor versions?

echo "Initializing anchor idl ..."
anchor idl init --filepath "$PROJECT_DIR/scripts/switchboard_v2.trimmed.json" "$program_id"  
echo "Upgrading anchor idl ..."
anchor idl upgrade --filepath "$PROJECT_DIR/target/idl/switchboard_v2.json" "$program_id"  

avm use "$anchor_ver"

echo "Creating Switchboard network ..."
cd "$SCRIPT_DIR"
# Create the switchboard environment
sbv2 solana network create \
    --keypair "$payer_keypair_path" \
    --configFile "./networks/default.json" \
    --schemaFile "./networks/default.schema.json" \
    --cluster localnet \
    --programId "$program_id" \
    --force --silent
cd "$WORKING_DIR"

oracle_pubkey=$(jq -r '.oracles[0].publicKey' "$SCRIPT_DIR/networks/default.schema.json")

echo "oracle pubkey: ${oracle_pubkey}"

