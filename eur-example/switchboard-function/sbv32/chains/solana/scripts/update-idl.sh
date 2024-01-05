#!/bin/bash

WORKING_DIR=$(pwd)
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
PROJECT_DIR=$(dirname "$SCRIPT_DIR")

# exit when any command fails
set -e

program_id=$(solana-keygen pubkey "$PROJECT_DIR/target/deploy/switchboard_v2-keypair.json")
anchor_ver=$(anchor --version | cut -d' ' -f2-)

avm use 0.24.2
anchor build
anchor idl upgrade --filepath target/idl/switchboard_v2.json "$program_id"
avm use "$anchor_ver"