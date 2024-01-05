# syntax=docker/dockerfile:1.4
FROM switchboardlabs/gramine:dev AS builder

RUN mkdir -p /opt/intel/sgx-dcap-pccs/ssl_key && \
    mkdir -p /data/protected_files

WORKDIR /home/root/switchboard

COPY ./rust/sgx-dcap-quoteverify-sys \
     ./rust/sgx-dcap-quoteverify-rs \
     ./rust/

COPY ./rust/switchboard-common/Cargo.toml \
     ./rust/switchboard-common/Cargo.lock \
     ./rust/switchboard-common/

COPY ./rust/switchboard-container-utils/Cargo.toml \
     ./rust/switchboard-container-utils/Cargo.lock \
     ./rust/switchboard-container-utils/

COPY ./rust/switchboard-solana/Cargo.toml \
     ./rust/switchboard-solana/Cargo.lock \
     ./rust/switchboard-solana/

COPY ./apps/function-simulator/Cargo.toml \
     ./apps/function-simulator/Cargo.lock \
     ./apps/function-simulator/build.rs \
     ./apps/function-simulator/

COPY ./rust/switchboard-common/src \
     ./rust/switchboard-common/src/

COPY ./rust/switchboard-container-utils/src \
     ./rust/switchboard-container-utils/src/

COPY ./rust/switchboard-solana/src \
     ./rust/switchboard-solana/src/

COPY ./apps/function-simulator/src \
     ./apps/function-simulator/src/

WORKDIR /home/root/switchboard/apps/function-simulator

COPY ./version /home/root/switchboard/version

RUN  --mount=type=cache,target=/usr/local/cargo/registry,id=${TARGETPLATFORM} \
     --mount=type=cache,target=target,id=${TARGETPLATFORM} \
     RUSTFLAGS=-Awarnings cargo build --release && \
     cargo strip && \
     mv target/release/function-simulator /app/

FROM switchboardlabs/gramine

###############################################################
### DOCKER SETUP
###############################################################
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

# Copy the binary
WORKDIR /app
COPY --from=builder /app/function-simulator /app/function-simulator

###############################################################
### Config Files (Copy last to avoid cache busting)
###############################################################
COPY ./apps/function-simulator/configs/sgx_default_qcnl.conf /etc/sgx_default_qcnl.conf
COPY --chown=root:root ./apps/function-simulator/configs/boot.sh /boot.sh

RUN chmod a+x /boot.sh

ENTRYPOINT /boot.sh