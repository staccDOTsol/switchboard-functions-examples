# NEAR

## Setup

- Install the NEAR cli `npm install -g near-cli`
- Install the Switchboard cli `npm install -g @switchboard-xyz/cli`

## Keypairs

The NEAR deployment uses a keypair for the contract address
(`switchboard-v2.near`/`switchboard-v2.testnet`) and a keypair for the authority
which manages the Switchboard accounts
(`sbv2-authority.near`/`sbv2-authority.testnet`)

You can find the NEAR keypairs in the following locations:

- **Mainnet**: `switchboard-v2.near` / `sbv2-authority.near` - 1Password _Near
  Mainnet_ vault
- **Testnet**: `switchboard-v2.testnet` / `sbv2-authority.testnet` - 1Password
  _Near Devnet_ vault

Grab the JSON files from the 1Password vault and store in the following location
and format

- **Mainnet**: `~/.near-credentials/mainnet/sbv2-authority.near.json`
- **Testnet**: `~/.near-credentials/testnet/sbv2-authority.testnet.json`

## Funding

On NEAR, 30% of all gas for a contract gets sent to the contract address. In
emergencies, we can use these funds to quickly fill the banker. Do **NOT**
transfer all funds. You will need to leave a portion of funds in the contract to
pay for storage cost.

1. Grab the switchboard-v2.near keypair from the 1Password _Near Mainnet_ vault
   and store it in `~/.near-credentials/mainnet/switchboard.near.json`
2. Run the following command to transfer 10 NEAR

```bash
NEAR_ENV=mainnet near send switchboard-v2.near sbv2-authority.near 10
```

## Manage Feeds

We can use the sbv2 CLI to add or remove NEAR job accounts. Make sure you have
the keypairs stored in the `~/.near-credentials` directory.

**Note:** For testnet, use
`--accountName sbv2-authority.testnet --networkId testnet`

### Add Jobs

Add an already created job to an existing feed

```bash
# sbv2 near aggregator add job [FEEDADDRESS] --jobKey [JOBADDRESS]
sbv2 near aggregator add job 8HCdgPY4Xs1seABgvizcWVCjRz7kgYJ29Rq5VETXGkh1 \
   --jobKey 2a4MM8yeESqhzH9bmGtFnAfMi9SUwVLcrkSMsc6WeWQC \
   --name "My New Job" \
   --jobWeight 1 \
   --accountName sbv2-authority.near \
   --networkId mainnet
```

Create and add a new job to a feed

```bash
# sbv2 near aggregator add job [FEEDADDRESS] --jobDefinition [JOBDEFINITION]
sbv2 near aggregator add job 8HCdgPY4Xs1seABgvizcWVCjRz7kgYJ29Rq5VETXGkh1 \
   --jobDefinition ./jobs/my-job.json \
   --name "My New Job" \
   --jobWeight 1 \
   --accountName sbv2-authority.near \
   --networkId mainnet
```

### Remove Jobs

```bash
# sbv2 near aggregator remove job [FEEDADDRESS] --jobAddress [JOBADDRESS]
sbv2 near aggregator remove job 8HCdgPY4Xs1seABgvizcWVCjRz7kgYJ29Rq5VETXGkh1 \
   --jobAddress 2a4MM8yeESqhzH9bmGtFnAfMi9SUwVLcrkSMsc6WeWQC \
   --accountName sbv2-authority.near \
   --networkId mainnet
```
