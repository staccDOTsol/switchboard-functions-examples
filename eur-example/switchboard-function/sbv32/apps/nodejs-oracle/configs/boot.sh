#!/bin/bash

# Boots the Switchboard NodeJS oracle

set -eo pipefail
set +u

# Start the attestation service
(
  AESM_PATH=/opt/intel/sgx-aesm-service/aesm LD_LIBRARY_PATH=/opt/intel/sgx-aesm-service/aesm exec /opt/intel/sgx-aesm-service/aesm/aesm_service --no-syslog
)
cd /opt/intel/sgx-dcap-pccs/ || exit
/usr/bin/node /opt/intel/sgx-dcap-pccs/pccs_server.js &

if [[ ! -d "/sgx/oracle" ]]; then
    echo "ERROR: failed to find directory /sgx/oracle"
    exit 1
fi

if [[ ! -e "/sgx/oracle.manifest" ]]; then
    echo "ERROR: oracle.manifest not found in /sgx"
    exit 1
fi

if [[ ! -e "/sgx/oracle.manifest.sgx" ]]; then
    echo "ERROR: oracle.manifest.sgx not found in /sgx"
    exit 1
fi

# Start the enclave
echo "Starting enclave.."
gramine-sgx /sgx/oracle
