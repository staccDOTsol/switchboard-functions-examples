#!/bin/bash

# Computes the measurement of a Switchboard Function

set -eo pipefail

gramine-manifest /sgx/bun.manifest.template > /sgx/bun.manifest

gramine-sgx-gen-private-key

gramine-sgx-sign --manifest /sgx/bun.manifest --output /sgx/bun.manifest.sgx | tee /out.txt

echo "0x$(cat /out.txt | tail -1 | sed -e "s/^[[:space:]]*//")" | tee /measurement.txt
