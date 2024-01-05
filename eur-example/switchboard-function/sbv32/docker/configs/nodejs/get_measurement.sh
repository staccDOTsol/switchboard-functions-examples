#!/bin/bash

# Computes the measurement of a Switchboard Function
# Uses the NodeJS runtime if $SGX_NODEJS is set or if --nodejs is provided to the script

set -eo pipefail

gramine-manifest /sgx/nodejs.manifest.template > /sgx/nodejs.manifest

gramine-sgx-gen-private-key

gramine-sgx-sign --manifest /sgx/nodejs.manifest --output /sgx/nodejs.manifest.sgx | tee /out.txt

echo "0x$(cat /out.txt | tail -1 | sed -e "s/^[[:space:]]*//")" | tee /measurement.txt
