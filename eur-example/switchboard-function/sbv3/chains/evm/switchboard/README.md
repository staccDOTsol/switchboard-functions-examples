<div align="center">

![Switchboard Logo](https://github.com/switchboard-xyz/core-sdk/raw/main/website/static/img/icons/switchboard/avatar.png)

# Switchboard EVM Contract

> The Switchboard EVM contract for V3 functions.

[![Discord Badge](https://img.shields.io/discord/841525135311634443?color=blueviolet&logo=discord&logoColor=white)](https://discord.gg/switchboardxyz) [![Twitter Badge](https://img.shields.io/twitter/follow/switchboardxyz?label=Follow+Switchboard)](https://twitter.com/switchboardxyz)

</div>

The Switchboard contract employs the [EIP-2535 Diamond Pattern](https://github.com/ethereum/EIPs/blob/master/EIPS/eip-2535.md) to facilitate a more modular contract design. Each _module_ is a facet that can be added to the contract resulting in an almost unlimited contract size.

You will need the following prerequisites installed to get started:

- [NodeJS](https://nodejs.org/en/download/package-manager)
- [Rust](https://rustup.rs/)
- [Docker](https://www.docker.com/get-started/)
- [Foundry\*](https://getfoundry.sh/)

`*` denotes an optional prerequisite

## Setup

Run the following command to install the NodeJS dependencies and generate the necessary typescript and Rust bindings for use in our SDKs.

```bash
pnpm install
pnpm build
```

## Localnet

The Foundry suite includes [anvil](https://book.getfoundry.sh/anvil/) which is useful for working with an EVM network locally. Run the following command to start a localnet instance:

```bash
anvil
```

Or use the hardhat command:

```bash
pnpm exec hardhat --network localhost node
```

Once you have the localnet node running, run the following command to deploy the Switchboard contract:

```bash
pnpm deploy:localhost
```

## Testing

The Switchboard contract includes tests written in Solidity and javascript.

To run the solidity tests:

```bash
forge test -vvv
```

To run the javascript tests:

```bash
pnpm test:localhost
```

## Rotating Authorities

To rotate authorities in Switchboard-EVM (Switchboard / Switchboard Push) you can use the `rotate_owners.ts` hardhat script.

First set the following environment variables:

```bash
export DIAMOND_ADDRESS=0x...
export QUEUE_ID=0x...
export NEW_AUTHORITY=0x...
export PUSH_RECEIVER_ADDRESS=0x...
```

Then run the script:

```bash
pnpm exec hardhat run scripts/rotate_owners.ts --network arbitrumTestnet # where the network is the network you want to rotate on
```
