# Mercurial Stable Swap Typescript Library

This is our preliminary release of our [Mercurial Finance](https://mercurial.finance) Stable Swap Typescript Library. If you have any questions, please ask in our [Discord](https://discord.gg/WwFwsVtvpH).

## Addresses

* Stable Swap Program Address: `MERLuDFBMmsHnsBPZw2sDQZHvXFMwp8EdjudcU2HKky`
* PAI 3-Pool (USDC-USDT-PAI): `SWABtvDnJwWwAb9CbSA3nv7nTnrtYjrACAVtuP3gyBB`
* UST 3-Pool (USDC-USDT-UST): `USD6kaowtDjwRkN5gAjw1PDMQvc9xRp8xW9GK8Z5HBA`
* pSOL 2-Pool (pSOL-SOL): `SoLw5ovBPNfodtAbxqEKHLGppyrdB4aZthdGwpfpQgi`
* wUSD 4-Pool (USDC-wUSDC-wUSDT-wDAI): `USD42Jvem43aBSLqT83GZmvRbzAjpKBonQYBQhni7Cv`
* stSOL 2-Pool (stSOL-SOL): `LiDoU8ymvYptqxenJ4YpcURBchn4ef63tcbdznBCKJh`
* mSOL 2-Pool (mSOL-SOL): `MAR1zHjHaQcniE2gXsDptkyKUnNfMEsLBVcfP7vLyv7`
* wbBUSD 4Pool (wbBUSD-wbUSDC-wbUSDT-USDC): `BUSDXyZeFXrcEkETHfgGh5wfqavmfC8ZJ8BbRP33ctaG`

## Cache

The `generate-cache` command is used to generate token mint accounts cache for the library in order to save on RPC calls, it will generate a mapping of token accounts to token mints under `./src/token-mints.json`.