# Solana Deploys

The Switchboard mainnet program is now a squads multi sig

## Devnet

1. Grab the upgrade-authority keypair from the 1Password _solana-devnet_ vault
   and store it in
   `~/switchboard_environments_v2/devnet/upgrade_authority/upgrade_authority.json`
2. Run the following commands to build the program with the devnet feature flag
   and deploy to devnet
3. Deploy the upgraded IDL

```bash
# Build the .so file
anchor build -- --features devnet
# Deploy the program
solana program deploy --program-id SW1TCH7qEPTdLsDHRgPuMQjbQxKdH2aBStViMFnt64f \
    --upgrade-authority ~/switchboard_environments_v2/devnet/upgrade_authority/upgrade_authority.json \
    --url https://switchbo-switchbo-6225.devnet.rpcpool.com/f6fb9f02-0777-498b-b8f5-67cbb1fc0d14 \
    ./target/deploy/switchboard_v2.so
# Deploy the IDL
anchor idl upgrade --filepath target/idl/switchboard_v2.json SW1TCH7qEPTdLsDHRgPuMQjbQxKdH2aBStViMFnt64f
```

_Optionally_, add `--keypair` to use a different payer for the deploy.

## Mainnet

1. Run the following commands to build the program and deploy the buffer account
2. Create a Squads proposal to upgrade the program
3. Deploy the IDL

```bash
# Build the .so file
anchor build
# Deploy the buffer
solana program write-buffer \
    --keypair ~/path/to/your/keypair.json \
    --buffer-authority ~/path/to/your/keypair.json \
    --url https://switchboard.rpcpool.com/ec20ad2831092cfcef66d677539a \
    ./target/deploy/switchboard_v2.so
```

Create the squads multisig proposal

Deploy the IDL

```bash
avm use 0.24.2
anchor build
anchor idl upgrade --filepath target/idl/switchboard_v2.json "$program_id"
avm use latest
```
