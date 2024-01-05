#!/bin/bash

docker pull \
    --platform linux/amd64 \
    acammm/spaceship-seed-generation-function:latest

docker create \
    --name my-spaceship-container \
    --platform linux/amd64 \
    acammm/spaceship-seed-generation-function:latest

docker run \
    --name my-spaceship-container \
    --attach STDOUT \
    --attach STDERR \
    --platform linux/amd64 \
    acammm/spaceship-seed-generation-function:latest

docker run \
    --rm \
    --attach STDOUT \
    --attach STDERR \
    --platform linux/amd64 \
    acammm/spaceship-seed-generation-function:latest


docker run \
    --rm \
    -it \
    --attach STDOUT \
    --attach STDERR \
    --platform "linux/amd64" \
    --restart=no \
    --read-only \
    --security-opt "no-new-privileges" \
    --memory "128m" \
    --cpus=0.2 \
    -v /var/run/aesmd/aesm.socket:/var/run/aesmd/aesm.socket:ro \
    --device /dev/sgx_provision:/dev/sgx_provision:rw \
    --device /dev/sgx_enclave:/dev/sgx_enclave:rw \
    --entrypoint "bash" \
    acammm/spaceship-seed-generation-function:latest \
    "/boot.sh"



docker run --name my-spaceship-container --platform linux/amd64 acammm/spaceship-seed-generation-function:latest

