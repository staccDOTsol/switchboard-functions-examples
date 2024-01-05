# Function Manager

The function manager is responsible for orchestrating a set of Switchboard Functions and relaying their output to the Quote Verification Oracle.

## Build

You will first need to build the QVN and the associated `qvn.tar`.

```bash
cd ../quote-verification-oracle
pnpm build:tar
cd ../function-manager
```

Then build the docker image:

```bash
pnpm docker:build
# or
docker buildx build -f Dockerfile --platform linux/amd64 --tag switchboardlabs/function-manager:dev-$(cat ../../version) -m 10g --pull --load ../../
```

Run the following to publish the image to the dockerhub registry:

```bash
pnpm docker:publish
# or
docker buildx build -f Dockerfile --platform linux/amd64 --tag switchboardlabs/function-manager:dev-$(cat ../../version) -m 10g --pull --push ../../
```

## Examples

You can run a simple example like so:

```bash
cargo run --example simple
```

## ENV

| Key     | Description            |
| ------- | ---------------------- |
| `CHAIN` | The target blockchain. |
