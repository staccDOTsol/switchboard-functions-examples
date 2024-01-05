#!/bin/bash

# Computes the measurement of a Switchboard Function
# Uses the NodeJS runtime if $SGX_NODEJS is set or if --nodejs is provided to the script

set -eo pipefail

nodejs_flag=false
if [[ -n "${SGX_NODEJS}" ]]; then
    nodejs_flag=true
else
    # If IS_NODEJS is not set, check all arguments
    for arg in "$@"; do
        if [[ "${arg}" == "--nodejs" ]]; then
            nodejs_flag=true
            break
        fi
    done
fi

if ${nodejs_flag}; then
  gramine-manifest /sgx/nodejs.manifest.template > /sgx/nodejs.manifest

  gramine-sgx-gen-private-key

  gramine-sgx-sign --manifest /sgx/nodejs.manifest --output /sgx/nodejs.manifest.sgx | tee /out.txt

  echo "0x$(cat /out.txt | tail -1 | sed -e "s/^[[:space:]]*//")" | tee /measurement.txt
else
  gramine-manifest /sgx/app.manifest.template > /sgx/app.manifest

  gramine-sgx-gen-private-key

  gramine-sgx-sign --manifest /sgx/app.manifest --output /sgx/app.manifest.sgx | tee /out.txt

  echo "0x$(cat /out.txt | tail -1 | sed -e "s/^[[:space:]]*//")" | tee /measurement.txt
fi