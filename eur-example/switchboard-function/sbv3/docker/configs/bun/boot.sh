#!/bin/bash

# Boots a Switchboard SGX Function

set -eo pipefail
set +u

if [[ ! -e "/sgx/bun" ]]; then
    echo "ERROR: executable not found at /sgx/bun"
    exit 1
fi

if [[ ! -e "/sgx/bun.manifest" ]]; then
    echo "ERROR: function bun.manifest not found at /sgx"
    exit 1
fi

if [[ ! -e "/sgx/bun.manifest.sgx" ]]; then
    echo "ERROR: function bun.manifest.sgx manifest not found at /sgx"
    exit 1
fi

# Start SGX-enabled application
echo "Starting enclave.."
gramine-sgx /sgx/bun
