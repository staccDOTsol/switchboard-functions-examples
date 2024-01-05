#!/bin/bash

PAYER_KEYPAIR="/Users/gally/switchboard_environments_v2/devnet/upgrade_authority/upgrade_authority.json"
ATTESTATION_PROGRAM_ID="A4vLwhBiKpbGxMQqUeaXESq57faTXFNjwLNKS4Tw96gt"

sb solana attestation-queue create \
  --keypair "${PAYER_KEYPAIR}" \
  --attestationProgramId "${ATTESTATION_PROGRAM_ID}"

# Path: javascript/cli/new_pid_setup.sh

ATTESTATION_QUEUE="6TgDfus8KzsRproQcJy2qGLsvm8zc5DeVdwV4QXtRJZ2"

sb solana verifier-oracle create "${ATTESTATION_QUEUE}" \
  --keypair "${PAYER_KEYPAIR}" \
  --attestationProgramId "${ATTESTATION_PROGRAM_ID}" \
  --enable

sb solana verifier-oracle create 6TgDfus8KzsRproQcJy2qGLsvm8zc5DeVdwV4QXtRJZ2 \
  --keypair /Users/gally/switchboard_environments_v2/devnet/upgrade_authority/upgrade_authority.json \
  --attestationProgramId A4vLwhBiKpbGxMQqUeaXESq57faTXFNjwLNKS4Tw96gt \
  --enable


# HL2jSHrxCprnmLHdY4rGSZ6pRGieBREcPHFbvzniYWYp

# Create a new function for the given queue
sb solana function create 6TgDfus8KzsRproQcJy2qGLsvm8zc5DeVdwV4QXtRJZ2 \
  --container "gallynaut/basic-oracle-function" \
  --version "RC_10-31-23_212" \
  --keypair "/Users/gally/switchboard_environments_v2/devnet/upgrade_authority/upgrade_authority.json"

# Set the MrEnclave value to the docker measurement
sb solana function sync-enclave HL2jSHrxCprnmLHdY4rGSZ6pRGieBREcPHFbvzniYWYp \
  --keypair "/Users/gally/switchboard_environments_v2/devnet/upgrade_authority/upgrade_authority.json"


sb solana function test --params ""