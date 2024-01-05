#!/bin/bash

master_account="${1:-2KgowxogBrGqRcgXQEmqFvC3PGtCu66qERNJevYW8Ajh}"

rpc_url="https://api.devnet.solana.com"
# rpc_url="https://switchbo-switchbo-6225.devnet.rpcpool.com/f6fb9f02-0777-498b-b8f5-67cbb1fc0d14"

function airdrop() {
    PUBKEY=$(solana-keygen pubkey pkey)

    solana airdrop 1 "${PUBKEY}" --url "${rpc_url}"
    solana airdrop 1 "${PUBKEY}" --url "${rpc_url}"
    solana airdrop 1 "${PUBKEY}" --url "${rpc_url}"
    solana airdrop 1 "${PUBKEY}" --url "${rpc_url}"
    solana airdrop 1 "${PUBKEY}" --url "${rpc_url}"

    balance=$(solana balance "${PUBKEY}" --url "${rpc_url}")
    if [[ "${balance}" != "0 SOL" ]]; then
      solana transfer --from pkey "$1" ALL --url "${rpc_url}" --fee-payer pkey

      solana-keygen new -o pkey -f --no-bip39-passphrase
    else
      echo "Skipping transfer, balance is empty"
    fi
    
}

solana-keygen new -o pkey -f --no-bip39-passphrase

while true
do
    airdrop "${master_account}"
done