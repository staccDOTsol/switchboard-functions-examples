FROM switchboardlabs/gramine:dev AS builder

ENV DATABASE_URL "postgres://cllaefkd:LuJ-94yCzaa4OW2RbEpaDtmSQ_JX1qfl@mahmud.db.elephantsql.com/cllaefkd"

WORKDIR /home/root/switchboard

COPY ./rust/sgx-dcap-quoteverify-rs/Cargo.toml \
     ./rust/sgx-dcap-quoteverify-rs/

COPY ./rust/sgx-dcap-quoteverify-sys/Cargo.toml \
     ./rust/sgx-dcap-quoteverify-sys/bindings.h \
     ./rust/sgx-dcap-quoteverify-sys/build.rs \
     ./rust/sgx-dcap-quoteverify-sys/sgx_dcap_quoteverify.h \
     ./rust/sgx-dcap-quoteverify-sys/

COPY ./apps/secrets-server/Cargo.toml \
     ./apps/secrets-server/Cargo.lock \
     ./apps/secrets-server/build.rs \
     ./apps/secrets-server/

COPY ./rust/sgx-dcap-quoteverify-rs/src ./rust/sgx-dcap-quoteverify-rs/src/
COPY ./rust/sgx-dcap-quoteverify-sys/src ./rust/sgx-dcap-quoteverify-sys/src/

COPY ./apps/secrets-server/src ./apps/secrets-server/src/

WORKDIR /home/root/switchboard/apps/secrets-server

COPY ./version /home/root/switchboard/version

RUN --mount=type=cache,target=/usr/local/cargo/registry,id=${TARGETPLATFORM} \
     --mount=type=cache,target=target,id=${TARGETPLATFORM} \
     RUSTFLAGS=-Awarnings cargo build --release && \
     cargo strip && \
     mv ./target/release/secrets-server /app/secrets-server

FROM switchboardlabs/gramine
WORKDIR /app
COPY --from=builder /app/secrets-server /app/secrets-server
EXPOSE 8080
CMD ["/app/secrets-server"]
