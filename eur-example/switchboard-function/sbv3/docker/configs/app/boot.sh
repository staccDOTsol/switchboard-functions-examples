#!/bin/bash

# Boots a Switchboard SGX Function

set -eo pipefail
set +u

if [[ ! -e "/sgx/app" ]]; then
    echo "ERROR: function binary not found at /sgx/app"
    exit 1
fi

if [[ ! -e "/sgx/app.manifest" ]]; then
    echo "ERROR: function app.manifest not found at /sgx"
    exit 1
fi

if [[ ! -e "/sgx/app.manifest.sgx" ]]; then
    echo "ERROR: function app.manifest.sgx manifest not found at /sgx"
    exit 1
fi

# Start SGX-enabled application
echo "Starting enclave.."
gramine-sgx /sgx/app
