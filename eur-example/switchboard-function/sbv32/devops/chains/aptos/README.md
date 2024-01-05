# Aptos Deploy

- [Setup Profiles](#setup-aptos-profiles)
  - [Local](#local)
  - [Testnet](#testnet)
  - [Mainnet](#mainnet)
- [Deploy](#deploy)

## Setup Aptos Profiles

### Local

Run the following commands. Press **ENTER** when prompted to generate a new
private key for our localnet deployment

```bash
# NOTE, must have local node running to create and fund profile
aptos node run-local-testnet --with-faucet & sleep 10
aptos init \
	--profile local \
	--network local \
	--assume-yes
```

> **Note** <br /> Run the following command to kill the local node after you're
> done <br /> <pre>lsof -t -i :8080 | xargs kill -9 || exit 0</pre>

### Testnet

Grab the **Aptos Testnet Pk** from the Devops 1Password Vault. When prompted,
copy the private key into the terminal.

```bash
aptos init \
	--profile testnet \
	--network testnet \
	--assume-yes
```

### Mainnet

Grab the **Aptos pk** from the Devops 1Password Vault. When prompted, copy the
private key into the terminal.

```bash
aptos init \
	--profile mainnet \
	--network mainnet \
	--assume-yes
```

## Deploy

1. Navigate or clone the
   [switchboard-aptos](https://github.com/switchboard-xyz/switchboard-aptos)
   repository
2. Run the following command, where PROFILE should be `local`, `testnet`, or
   `mainnet`

```bash
PROFILE="local" aptos move publish \
	--profile $PROFILE \
	--package-dir ./switchboard \
	--named-addresses switchboard=$PROFILE \
	--override-size-check \
	--included-artifacts none
```
