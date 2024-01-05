# CoreDAO Deploys

The Switchboard mainnet program is deployed through a hardhat script

## Mainnet

1. Grab the coredao mainnet deployer keypair from the 1Password devops wallet
   and store it in
   `~/switchboard-evm/hardhat.config.ts` in the accounts array.
2. Run `npx hardhat run --network=coredao scripts/deploy.js`

## Testnet

1. Grab the coredao testnet deployer keypair from the 1Password devops wallet
   and store it in
   `~/switchboard-evm/hardhat.config.ts` in the accounts array.
2. Run `npx hardhat run --network=tcoredao scripts/deploy.js`

# CoreDAO V1

### CoreDAO V1 Testnet

- sbAuthority: '0xa880445a6ee98ead1ef218c423a51cea5912f66b'
- contract: '0xB27eB427A3675956Cdc2600d387F8d8aa44433CC'
- queueAddress - permissionless: '0x1e373Ac0a299E6CCfE6bd333025E5Ebef9Eca2Dd'

### CoreDAO V1 Mainnet

- sbAuthority: '0xF24f2A3349D90A81796Bb8409114d0Cf64211F03'
- contract: '0x73d6C66874e570f058834cAA666b2c352F1C792D'
- queueAddress - permissionless: '0x628D9A4109FD1B94348b7866923A4b7aae3D61c6'
- queueAddress - permissioned: '0x1e373Ac0a299E6CCfE6bd333025E5Ebef9Eca2Dd'

## Coredao Devops

| Network                | Pubkeys                                                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mainnet Permissioned   | Queue: `0x1e373Ac0a299E6CCfE6bd333025E5Ebef9Eca2Dd` <br />Oracle Payer: `0xee3920F1b40095578D40023Fd30e476E56CcF19C` <br />Oracle: `0x8beaC9563D76Af522D6e6854251135B3659f5eE4` |
| Mainnet Permissionless | Queue: `0x628D9A4109FD1B94348b7866923A4b7aae3D61c6` <br />Oracle Payer: `0x17Cb220aE5AC496d4FC7fB2c9d33D2c6F52fc340` <br />Oracle: `0x1f7d1893AB78255b8057f1437a0d9b9C39e49660` |
| Testnet Permissionless | Queue: `0x83Fb069B10426056Ef8Ca54750cB9bB552a59e7D` <br />Oracle Payer: `0xA880445a6eE98ead1ef218C423a51cea5912F66B` <br />Oracle: `0x628D9A4109FD1B94348b7866923A4b7aae3D61c6` |

## Funding

On CoreDAO, you gas is paid in full to the oracle nodes. The easiest way to fund the oracles with CORE is using Metamask.

To setup Metamask (one-time setup):

1. Add the extension to your chromium browser from [metamask.io](https://metamask.io/).
2. Open Metamask. Click the network selector in the middle of the header labeled "Ethereum Mainnet".
3. Select "Add network". This will redirect you to the Metamask settings page.
4. At the bottom of the page, you'll see an option for "Add a network manually". Select it.
5. Add the following info for the CoreDAO network:

- Network name: CoreDAO Mainnet
- New RPC URL: https://rpc.coredao.org
- Chain ID: 1116
- Currency symbol: CORE
- Block explorer URL (Optional): https://scan.coredao.org/

## Adding Testnet to Metamask

- For Testnet
- Navigate to https://scan.test.btcs.network/
- Click the "add to metamask" button on the bottom left

## Testnet Faucet

- https://scan.test.btcs.network/faucet

## Sending Funds

Confirm that oracle balances are low::
Mainnet Permissioned
https://scan.coredao.org/address/0xee3920F1b40095578D40023Fd30e476E56CcF19C

Mainnet Permissionless
https://scan.coredao.org/address/0x17Cb220aE5AC496d4FC7fB2c9d33D2c6F52fc340


Payers:
0xee3920F1b40095578D40023Fd30e476E56CcF19C oracle 1
0x17Cb220aE5AC496d4FC7fB2c9d33D2c6F52fc340 oracle 2
