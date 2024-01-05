#!/bin/bash

# Computes the measurement of a Switchboard Function

set -eo pipefail

gramine-manifest /sgx/app.manifest.template > /sgx/app.manifest

gramine-sgx-gen-private-key

gramine-sgx-sign --manifest /sgx/app.manifest --output /sgx/app.manifest.sgx | tee /out.txt

echo "0x$(cat /out.txt | tail -1 | sed -e "s/^[[:space:]]*//")" | tee /measurement.txt
