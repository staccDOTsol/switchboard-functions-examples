# syntax=docker/dockerfile:1.4
FROM switchboardlabs/gramine:dev AS base

RUN mkdir -p /opt/intel/sgx-dcap-pccs/ssl_key && \
    mkdir -p /data/protected_files && \
    mkdir -p /home/credentials

ARG OPTIMISM
ENV OPTIMISM=$OPTIMISM

WORKDIR /home/root/switchboard

# COPY ./rust/switchboard-cloud-utils/Cargo.toml ./rust/switchboard-cloud-utils/Cargo.toml
COPY ./rust/switchboard-container-utils/Cargo.toml \
     ./rust/switchboard-container-utils/Cargo.toml

# COPY ./rust/switchboard-cloud-utils/src ./rust/switchboard-cloud-utils/src/
COPY ./rust/switchboard-container-utils/src \
     ./rust/switchboard-container-utils/src/

COPY ./rust/switchboard-common/Cargo.toml \
     ./rust/switchboard-common/Cargo.toml
COPY ./rust/switchboard-common/src \
     ./rust/switchboard-common/src/

COPY ./rust/switchboard-solana/Cargo.toml \
     ./rust/switchboard-solana/Cargo.toml
COPY ./rust/switchboard-solana/src \
     ./rust/switchboard-solana/src/

WORKDIR /home/root/switchboard/apps/function-manager

# These files are needed to build the libs
# We dont need main.rs
COPY ./apps/function-manager/src/env \
     ./src/env/
COPY ./apps/function-manager/src/qvn \
     ./src/qvn/
COPY ./apps/function-manager/src/docker_utils \
     ./src/docker_utils/
COPY ./apps/function-manager/src/metrics \
     ./src/metrics/
COPY ./apps/function-manager/src/network_watcher \
     ./src/network_watcher/
COPY ./apps/function-manager/src/error.rs \
     ./src/error.rs

###############################################################
### Build GCP Library
###############################################################
FROM base AS gcp-lib
WORKDIR /home/root/switchboard/apps/function-manager/lib/gcp
COPY ./apps/function-manager/lib/gcp/Cargo.toml ./Cargo.toml
COPY ./apps/function-manager/lib/gcp/Cargo.lock ./Cargo.lock
COPY ./apps/function-manager/lib/gcp/src ./src/
RUN --mount=type=cache,target=/root/.cargo/registry \
    --mount=type=cache,target=/home/root/switchboard/apps/function-manager/lib/gcp/target \
    RUSTFLAGS=-Awarnings cargo build --release && \
    mv ./target/release/libgcp.a /home/root/switchboard/apps/function-manager/

###############################################################
### Build Starknet Library
###############################################################
# FROM base AS starknet-lib
# WORKDIR /home/root/switchboard/apps/function-manager/lib/starknet
# COPY ./apps/function-manager/lib/starknet/Cargo.toml ./Cargo.toml
# COPY ./apps/function-manager/lib/starknet/Cargo.lock ./Cargo.lock
# COPY ./apps/function-manager/lib/starknet/src ./src/
# RUN --mount=type=cache,target=/root/.cargo/registry \
#     --mount=type=cache,target=/home/root/switchboard/apps/function-manager/lib/starknet/target \
#     RUSTFLAGS=-Awarnings cargo build --release && \
#     mv ./target/release/libstarknet.a /home/root/switchboard/apps/function-manager/

###############################################################
### Build EVM Library
###############################################################
FROM base AS evm-lib
WORKDIR /home/root/switchboard
COPY ./rust/switchboard-evm/Cargo.toml ./rust/switchboard-evm/Cargo.toml
COPY ./rust/switchboard-evm/src ./rust/switchboard-evm/src/
WORKDIR /home/root/switchboard/apps/function-manager/lib/evm
COPY ./apps/function-manager/lib/evm/Cargo.toml ./Cargo.toml
COPY ./apps/function-manager/lib/evm/Cargo.lock ./Cargo.lock
COPY ./apps/function-manager/lib/evm/src ./src/
RUN --mount=type=cache,target=/root/.cargo/registry \
    --mount=type=cache,target=/home/root/switchboard/apps/function-manager/lib/evm/target \
    RUSTFLAGS=-Awarnings cargo build --release && \
    mv ./target/release/libevm.a /home/root/switchboard/apps/function-manager/

###############################################################
### Build Solana Library
###############################################################
FROM base AS solana-lib
WORKDIR /home/root/switchboard
COPY ./rust/switchboard-solana/Cargo.toml ./rust/switchboard-solana/Cargo.toml
COPY ./rust/switchboard-solana/src ./rust/switchboard-solana/src/
WORKDIR /home/root/switchboard/apps/function-manager/lib/solana
COPY ./apps/function-manager/lib/solana/Cargo.toml ./Cargo.toml
COPY ./apps/function-manager/lib/solana/Cargo.lock ./Cargo.lock
COPY ./apps/function-manager/lib/solana/src ./src/
RUN --mount=type=cache,target=/root/.cargo/registry \
    --mount=type=cache,target=/home/root/switchboard/apps/function-manager/lib/solana/target \
    RUSTFLAGS=-Awarnings cargo build --release && \
    mv ./target/release/libsolana.a /home/root/switchboard/apps/function-manager/

###############################################################
### Build Function Manager
###############################################################
FROM base AS builder
WORKDIR /home/root/switchboard/apps/function-manager/
COPY --from=gcp-lib /home/root/switchboard/apps/function-manager/libgcp.a ./libgcp.a
# COPY --from=starknet-lib /home/root/switchboard/apps/function-manager/libstarknet.a ./libstarknet.a
COPY --from=solana-lib /home/root/switchboard/apps/function-manager/libsolana.a ./libsolana.a
COPY --from=evm-lib /home/root/switchboard/apps/function-manager/libevm.a ./libevm.a

COPY ./apps/function-manager/Cargo.toml.template ./Cargo.toml
COPY ./apps/function-manager/build.rs ./build.rs
COPY ./apps/function-manager/src ./src/
COPY ./version /home/root/switchboard/version
RUN --mount=type=cache,target=/root/.cargo/registry \
    --mount=type=cache,target=/home/root/switchboard/apps/function-manager/target \
    RUSTFLAGS=-Awarnings cargo build --release && \
    mv target/release/function-manager /app/function-manager

###############################################################
### Copy to final image
###############################################################
FROM switchboardlabs/gramine
RUN mkdir -p /data/protected_files && \
    mkdir -p /home/credentials

# Docker Setup
RUN curl -fsSL https://download.docker.com/linux/ubuntu/gpg | apt-key add - && \
    add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable"
RUN --mount=type=cache,id=apt-cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,id=apt-lib,target=/var/lib/apt,sharing=locked \
    --mount=type=cache,id=debconf,target=/var/cache/debconf,sharing=locked \
    set -exu && \
    DEBIAN_FRONTEND=noninteractive apt update && \
    apt -y --no-install-recommends install \
    containerd.io \
    docker-buildx-plugin \
    docker-ce \
    docker-ce-cli \
    docker-compose-plugin \
    fuse-overlayfs
RUN usermod -aG docker root
RUN curl https://raw.githubusercontent.com/stepchowfun/docuum/main/install.sh -LSfs | sh
RUN echo "{ \"storage-driver\": \"fuse-overlayfs\", \"seccomp-profile\": \"/configs/seccomp.json\" }" > /etc/docker/daemon.json
# RUN echo "{ \"seccomp-profile\": \"/configs/seccomp.json\" }" > /etc/docker/daemon.json

# Copy the binary
WORKDIR /app
COPY --from=builder /app/function-manager /app/function-manager

###############################################################
### Config Files (Copy last to avoid cache busting)
###############################################################
COPY ./apps/function-manager/configs/boot.sh /boot.sh
# COPY ./apps/function-manager/files/qvn.tar /qvn.tar
# Can be overwritten by mounting a volume
RUN echo "{}" > /home/credentials/gcp-sa.json

RUN chmod a+x /boot.sh

RUN apt-get install -y wget curl
RUN apt-get install -y dnsutils
ENTRYPOINT /boot.sh
