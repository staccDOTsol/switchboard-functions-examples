# Quote Verification Oracle

The Quote Verification Oracle (QVN) is responsible for calculating the MRENCLAVE measurement from an SGX generated quote.

## Build

```bash
pnpm docker:build
# or
docker buildx build -f Dockerfile --platform linux/amd64 --tag qvn -m 10g --pull --load ../../
```

Then output the `qvn.tar` so we can load it directly into the function manager:

```bash
docker save --output qvn.tar qvn
chmod a+rw qvn.tar
cp qvn.tar ../function-manager/files/qvn.tar
```

## ENV

| Key     | Description            |
| ------- | ---------------------- |
| `CHAIN` | The target blockchain. |
