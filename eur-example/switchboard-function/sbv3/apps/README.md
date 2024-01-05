# Oracle

this builds the qvn and copies the container into the dind-manager repo

```bash
cd quote-verification-oracle
docker build . --tag qvn -m 10g && docker save --output qvn.tar qvn && chmod a+rw qvn.tar && cp qvn.tar ../function-manager/files/
```

for building functions manager

```bash
cd function-manager
sudo DOCKER_BUILDKIT=1 docker build . --tag switchboardlabs/dind -m 10g

```

For running the function-manager

```bash
sudo docker run --privileged -it --rm -v /dev/sgx:/dev/sgx --env-file env.list -v /home/credentials/:/home/credentials/ -v /var/run/aesmd:/var/run/aesmd switchboardlabs/dind
```

where `env.list` looks like

```env
CHAIN=solana
RPC_URL=https://switchbo-switchbo-6225.devnet.rpcpool.com/f6fb9f02-0777-498b-b8f5-67cbb1fc0d14
GOOGLE_APPLICATION_CREDENTIALS=/home/credentials/gcp-sa.json
GOOGLE_PAYER_SECRET_PATH=projects/switchboard-devnet/secrets/payer_secrets_v2/versions/latest
DOCKER_USER=mgild
DOCKER_KEY=dckr_pat_oFQKMUc_jCKNfVbZo5tje--Bc-E
IPFS_URL=https://ipfs.infura.io:5001
IPFS_KEY=2OuGHppwQzKcS9HErVCZ12ngIIr
IPFS_SECRET=cbfd29f500aee37e0b4139dabdbe396a
QUOTE_KEY=GuPYEECASK9Rrb2EdaecXccZj5XUCSDpDCXFbhPHo7JZ
HEARTBEAT_INTERVAL=30
```

## With Hydrobuild

```bash
# Build and package the quote verification oracle app.
cd quote-verification-oracle
docker buildx build . --platform linux/amd64 --tag qvn --builder cloud-switchboardlabs-default
docker save --output qvn.tar qvn && chmod a+rw qvn.tar
# Move output to the function-manager directory.
cp qvn.tar ../function-manager/files/
# Build and package the function manager app.
cd ../function-manager
docker buildx build . --platform linux/amd64 --tag switchboardlabs/dind --builder cloud-switchboardlabs-default
```
