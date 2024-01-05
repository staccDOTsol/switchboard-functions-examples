# syntax=docker/dockerfile:1.4
FROM switchboardlabs/gramine:dev AS base

RUN mkdir -p /opt/intel/sgx-dcap-pccs/ssl_key && \
    mkdir -p /data/protected_files

ARG OPTIMISM
ENV OPTIMISM=$OPTIMISM

WORKDIR /home/root/switchboard

COPY ./rust/sgx-dcap-quoteverify-sys/build.rs ./rust/sgx-dcap-quoteverify-sys/build.rs
COPY ./rust/sgx-dcap-quoteverify-sys/bindings.h ./rust/sgx-dcap-quoteverify-sys/bindings.h
COPY ./rust/sgx-dcap-quoteverify-sys/Cargo.toml ./rust/sgx-dcap-quoteverify-sys/Cargo.toml
COPY ./rust/sgx-dcap-quoteverify-sys/src ./rust/sgx-dcap-quoteverify-sys/src/

COPY ./rust/sgx-dcap-quoteverify-rs/Cargo.toml ./rust/sgx-dcap-quoteverify-rs/Cargo.toml
COPY ./rust/sgx-dcap-quoteverify-rs/src ./rust/sgx-dcap-quoteverify-rs/src/

COPY ./rust/switchboard-common/Cargo.toml ./rust/switchboard-common/Cargo.toml
COPY ./rust/switchboard-common/src ./rust/switchboard-common/src/

COPY ./rust/switchboard-solana/Cargo.toml ./rust/switchboard-solana/Cargo.toml
COPY ./rust/switchboard-solana/src ./rust/switchboard-solana/src/

WORKDIR /home/root/switchboard/apps/quote-verification-oracle

# These files are needed to build the libs
# We dont need main.rs
COPY ./apps/quote-verification-oracle/src/error ./src/error/
COPY ./apps/quote-verification-oracle/src/quote_verify ./src/quote_verify/
COPY ./apps/quote-verification-oracle/src/sgx ./src/sgx/
COPY ./apps/quote-verification-oracle/src/env ./src/env/
COPY ./apps/quote-verification-oracle/src/ipfs ./src/ipfs/

###############################################################
### Build Starknet Library
###############################################################
# FROM base AS starknet-lib
# WORKDIR /home/root/switchboard/apps/quote-verification-oracle/lib/starknet
# COPY ./apps/quote-verification-oracle/lib/starknet/Cargo.toml ./Cargo.toml
# COPY ./apps/quote-verification-oracle/lib/starknet/src ./src
# RUN --mount=type=cache,target=/root/.cargo/registry \
#     --mount=type=cache,target=/home/root/switchboard/apps/quote-verification-oracle/lib/starknet/target \
#     RUSTFLAGS=-Awarnings cargo build --release && \
#     mv target/release/libstarknet.a /home/root/switchboard/apps/quote-verification-oracle/

###############################################################
### Build EVM Library
###############################################################
FROM base AS evm-lib
WORKDIR /home/root/switchboard
COPY ./rust/switchboard-evm/Cargo.toml ./rust/switchboard-evm/Cargo.toml
COPY ./rust/switchboard-evm/src ./rust/switchboard-evm/src/
WORKDIR /home/root/switchboard/apps/quote-verification-oracle/lib/evm
COPY ./apps/quote-verification-oracle/lib/evm/Cargo.toml ./Cargo.toml
COPY ./apps/quote-verification-oracle/lib/evm/build.rs ./build.rs
COPY ./apps/quote-verification-oracle/lib/evm/src ./src
RUN --mount=type=cache,target=/root/.cargo/registry \
    --mount=type=cache,target=/home/root/switchboard/apps/quote-verification-oracle/lib/evm/target \
    RUSTFLAGS=-Awarnings cargo build --release && \
    mv target/release/libevm.a /home/root/switchboard/apps/quote-verification-oracle/

###############################################################
### Build Solana Library
###############################################################
FROM base AS solana-lib
WORKDIR /home/root/switchboard
COPY ./rust/switchboard-solana/Cargo.toml ./rust/switchboard-solana/Cargo.toml
COPY ./rust/switchboard-solana/src ./rust/switchboard-solana/src/
WORKDIR /home/root/switchboard/apps/quote-verification-oracle/lib/solana
COPY ./apps/quote-verification-oracle/lib/solana/Cargo.toml ./Cargo.toml
COPY ./apps/quote-verification-oracle/lib/solana/src ./src
RUN --mount=type=cache,target=/root/.cargo/registry \
    --mount=type=cache,target=/home/root/switchboard/apps/quote-verification-oracle/lib/solana/target \
    RUSTFLAGS=-Awarnings cargo build  && \
    mv target/debug/libsolana.a /home/root/switchboard/apps/quote-verification-oracle/

###############################################################
### Build Quote Verification Oracle
###############################################################
FROM base AS builder
WORKDIR /home/root/switchboard/apps/quote-verification-oracle

# COPY --from=starknet-lib /home/root/switchboard/apps/quote-verification-oracle/libstarknet.a ./libstarknet.a
COPY --from=evm-lib /home/root/switchboard/apps/quote-verification-oracle/libevm.a ./libevm.a
COPY --from=solana-lib /home/root/switchboard/apps/quote-verification-oracle/libsolana.a ./libsolana.a

COPY ./apps/quote-verification-oracle/build.rs ./build.rs
COPY ./apps/quote-verification-oracle/Cargo.toml.template ./Cargo.toml
COPY ./apps/quote-verification-oracle/src ./src/
COPY ./version /home/root/switchboard/version

RUN --mount=type=cache,target=/root/.cargo/registry \
    --mount=type=cache,target=/home/root/switchboard/apps/quote-verification-oracle/target \
    RUSTFLAGS=-Awarnings cargo build && \
    mv target/debug/qvn /app/qvn

###############################################################
### Copy to final image
###############################################################
FROM switchboardlabs/gramine
# Can be overwritten by mounting a volume
RUN mkdir -p /home/credentials && \
    mkdir -p /data/protected_files && \
    echo "{}" > /home/credentials/gcp-sa.json

###############################################################
### Linux Setup
###############################################################
ENV SGX_DCAP_VERSION="1.19.100.3-focal1"
RUN mv /etc/sgx_default_qcnl.conf /etc/sgx_default_qcnl.conf.bkup
RUN --mount=type=cache,id=apt-cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,id=apt-lib,target=/var/lib/apt,sharing=locked \
    --mount=type=cache,id=debconf,target=/var/cache/debconf,sharing=locked \
    set -exu && \
    DEBIAN_FRONTEND=noninteractive apt update && \
    apt -y --no-install-recommends install \
    libsgx-dcap-quote-verify-dev=${SGX_DCAP_VERSION} \
    libsgx-dcap-quote-verify=${SGX_DCAP_VERSION} \
    libsgx-dcap-default-qpl-dev=${SGX_DCAP_VERSION} \
    libsgx-dcap-default-qpl=${SGX_DCAP_VERSION} \
    libssl-dev
RUN rm -rf /etc/sgx_default_qcnl.conf && \
    mv /etc/sgx_default_qcnl.conf.bkup /etc/sgx_default_qcnl.conf

WORKDIR /app
COPY --from=builder /app/qvn /app/qvn
COPY ./apps/quote-verification-oracle/configs/seccomp.json /configs/seccomp.json
COPY ./apps/quote-verification-oracle/configs/qvn.manifest.template /app/qvn.manifest.template
COPY ./apps/quote-verification-oracle/configs/boot.sh /boot.sh

RUN gramine-manifest /app/qvn.manifest.template > /app/qvn.manifest
RUN gramine-sgx-gen-private-key
RUN gramine-sgx-sign --manifest /app/qvn.manifest --output /app/qvn.manifest.sgx | tail -2 | tee /measurement.txt

RUN chmod a+x /boot.sh

ENTRYPOINT bash /boot.sh
