#!/bin/bash

# Boots a Switchboard SGX Function
# Uses the NodeJS runtime if $SGX_NODEJS is set or if --nodejs is provided to the script

set -eo pipefail
set +u

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
  if [[ ! -e "/sgx/nodejs/index.js" ]]; then
      echo "ERROR: index.js not found at /sgx/nodejs"
      exit 1
  fi

  if [[ ! -e "/sgx/nodejs.manifest" ]]; then
      echo "ERROR: function nodejs.manifest not found at /sgx"
      exit 1
  fi

  if [[ ! -e "/sgx/nodejs.manifest.sgx" ]]; then
      echo "ERROR: function nodejs.manifest.sgx manifest not found at /sgx"
      exit 1
  fi

  # Start SGX-enabled application
  echo "Starting enclave.."
  gramine-sgx /sgx/nodejs
else
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
fi