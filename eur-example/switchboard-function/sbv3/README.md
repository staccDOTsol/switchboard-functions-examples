<div align="center">

![Switchboard Logo](https://github.com/switchboard-xyz/switchboard/raw/main/website/static/img/icons/switchboard/avatar.png)

# Switchboard

> Internal Switchboard repo.

[![CI](https://github.com/switchboard-xyz/sbv3/actions/workflows/ci.yml/badge.svg)](https://github.com/switchboard-xyz/sbv3/actions/workflows/ci.yml)
[![Solana](https://github.com/switchboard-xyz/sbv3/actions/workflows/solana.yml/badge.svg)](https://github.com/switchboard-xyz/sbv3/actions/workflows/solana.yml)
[![EVM](https://github.com/switchboard-xyz/sbv3/actions/workflows/evm.yml/badge.svg)](https://github.com/switchboard-xyz/sbv3/actions/workflows/evm.yml)

[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg)](http://commitizen.github.io/cz-cli/)

</div>

## Table of Contents

- [Setup](#setup)
- [Usage](#usage)
- [Features](#features)
  - [Simulate a V2 Feed](#simulate-a-v2-feed)
- [Publishing](#publishing-to-npm)
- [Troubleshooting](#troubleshooting)
  - [EVM Tooling Issues](#evm-tooling-issuess)

Each package.json has a set of scripts to help development for each individual project, including non-javascript apps. Always check the package.json first for useful commands such as `pnpm docker:build` to build a local Dockerfile or `pnpm fix` to run linting and fix any common issues.

## Setup

```bash
git clone https://github.com/switchboard-xyz/sbv3
cd sbv3
git submodule update --init --recursive
pnpm install
```

Run the following script to install all dependencies (Rust, NodeJS, Aptos, Sui, Solana, Anchor, Foundry, etc)

```bash
./scripts/setup-deps.sh
```

Add the following to your `~/.zshrc` to add devops scripts to your $PATH (Make sure it points to the correct install location)

```bash
source $HOME/dev/switchboard/sbv3/scripts/devops/k8s-scripts.sh
```

### Manually Setup Dependencies

You should be on at least Node 18 with pnpm and turbo installed

```bash
npm install --global pnpm
npm install --global turbo
npm install --global commitizen
npm install --global release-please
```

You will need Rust with clippy

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup component add clippy
rustup component add rustfmt
```

## Usage

Install the javascript dependencies

```bash
pnpm install
turbo run build
turbo run lint
```

When running commands use `turbo run [SCRIPT]` instead of `pnpm [SCRIPT]` to have turborepo automatically build a package's dependencies and cache the result. Add the flag `--force` to overwrite the cache and rebuild all dependencies.

**Fix All Linting Errors:**

```bash
pnpm fix
# or
turbo run fix
# or to run without using cache
turbo run fix --force
```

**Run All Tests:**

```bash
pnpm test
# or
turbo run test
# or to run without using cache
turbo run test --force
```

**Build Specific Package & Dependencies**:

```bash
# To build the task-runner and all of its sub dependencies (solana SDK, EVM SDK, etc)
turbo run build --filter='@switchboard-xyz/task-runner'

# To build all packages in the javascript directory
turbo run build --filter='./javascript/*'
```

## Features

### Simulate a V2 Feed

Run the following to simulate an aggregator against the local task runner. Add the flag `--cluster devnet` to target a devnet feed.

```bash
sb-tools test-aggregator GvDMxPzN1sCj7L26YDK2HnMRXEQmQ2aemov8YBtPS7vR
```

Run the following to simulate an individual job against the local task runner:

```bash
sb-tools test-job DrgD1L43sVzYGprcYSDHAoxZa5u6un7zrt6eQZyUJegV
```

See [javascript/sb-tools/src/index.ts](./javascript/sb-tools/src/index.ts) for more details.

## Publishing to NPM

To publish to npm run the command:

```bash
pnpm publish
# or skip any git checks
pnpm publish --no-git-checks
```

If you run this command using npm instead of pnpm it will not link
the dynamic libraries correctly.

## Troubleshooting

Are build scripts failing and you want to skip any of the repo voodoo? Add `--force` to any turbo command and run the following from the repo root.

```bash
turbo run build --force
```

### EVM Tooling Issues

```bash
# remove node modules
rm -rf node_modules
# install again
pnpm install
# build common
cd javascript/common
pnpm build

# build evm.js
cd ../evm.js
pnpm build

# ... or hardhat shouldn't give you trouble anymore
cd ../../chains/evm/switchboard
pnpm exec hardhat typechain
```
