# Near

## Deploy

```bash
cd contract
./build.sh
near deploy switchboard-v2.testnet target/wasm32-unknown-unknown/release/switchboard.wasm
```

For an initial deploy of the contract,

```bash
near deploy switchboard-v2.testnet target/wasm32-unknown-unknown/release/switchboard.wasm \
    --initFunction "init" --initArgs "{}"
```

## Dev Deploy

```bash
cd contract
./build.sh
near dev-deploy target/wasm32-unknown-unknown/release/switchboard.wasm \
    --initFunction "init" --initArgs "{}"
```

**NOTE:** You need to remove `contract/neardev` if you want a fresh deploy

## Mainnet Deploy

export NEAR_ENV=mainnet

Create the token account

```bash
NEAR_ENV=mainnet near call wrap.near storage_deposit '{"account_id": "switchboard-v2.near"}' --deposit 0.00125 --accountId sbv2-authority.near
```

Deploy the program

```bash
cd contract
./build.sh
NEAR_ENV=mainnet near deploy switchboard-v2.near target/wasm32-unknown-unknown/release/switchboard.wasm \
    --initFunction "init" --initArgs "{}"
```
