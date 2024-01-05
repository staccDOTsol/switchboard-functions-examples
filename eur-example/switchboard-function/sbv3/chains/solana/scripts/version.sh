#!/bin/bash

WORKING_DIR=$(pwd)
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
SOLANA_DIR=$(dirname "${SCRIPT_DIR}")

WORKSPACE_ROOT=$(dirname "$(dirname "${SOLANA_DIR}")")
VERSION_FILE="${WORKSPACE_ROOT}/version"

version_string=$(tr -d '\n' < "${VERSION_FILE}" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
echo "Version: ${version_string}"

# Echo version into switchboard_v2 program
echo "pub const VERSION: &str = \"${version_string}\";" > "${SOLANA_DIR}/programs/switchboard_v2/src/version.rs"
echo "pub const VERSION: &str = \"${version_string}\";" > "${SOLANA_DIR}/programs/attestation_program/src/version.rs"