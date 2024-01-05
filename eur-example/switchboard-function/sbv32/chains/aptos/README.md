<div align="center">
  <a href="#">
    <img height="170" src="https://github.com/switchboard-xyz/sbv2-core/raw/main/website/static/img/icons/switchboard/avatar.svg" />
  </a>

  <h1>switchboard-aptos</h1>

  <p>The Switchboard V2 move module for the Aptos blockchain.</p>

  <p>
    <a href="https://discord.gg/switchboardxyz">
      <img alt="Discord" src="https://img.shields.io/discord/841525135311634443?color=blueviolet&logo=discord&logoColor=white">
    </a>
    <a href="https://twitter.com/switchboardxyz">
      <img alt="Twitter" src="https://img.shields.io/twitter/follow/switchboardxyz?label=Follow+Switchboard" />
    </a>
  </p>

  <h4>
    <strong>Documentation: </strong><a href="https://docs.switchboard.xyz">docs.switchboard.xyz</a>
  </h4>
</div>

## Getting Started

To get started, clone the
[switchboard-aptos](https://github.com/switchboard-xyz/switchboard-aptos)
repository.

```bash
git clone https://github.com/switchboard-xyz/switchboard-aptos
```

## Localnet

Start a local node

```bash
aptos node run-local-testnet --with-faucet & sleep 5
```

Create your Aptos profile

```bash
export PROFILE=local
aptos init \
	--profile $PROFILE \
	--network local \
	--rest-url http://localhost:8080 \
	--faucet-url http://localhost:8081 \
	--assume-yes
```

Deploy the Switchboard move module

```bash
aptos move publish \
	--profile $PROFILE \
	--package-dir ./switchboard \
	--named-addresses switchboard=$PROFILE \
	--override-size-check \
	--included-artifacts none
```

Run the following to kill the aptos node

```bash
lsof -t -i :8080 | xargs kill -9 || exit 0
```
