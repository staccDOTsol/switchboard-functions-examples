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

### CoreDAO V1  Mainnet

- sbAuthority: '0xF24f2A3349D90A81796Bb8409114d0Cf64211F03'
- contract: '0x73d6C66874e570f058834cAA666b2c352F1C792D'
- queueAddress - permissionless: '0x628D9A4109FD1B94348b7866923A4b7aae3D61c6'
- queueAddress - permissioned: '0x1e373Ac0a299E6CCfE6bd333025E5Ebef9Eca2Dd'
  
