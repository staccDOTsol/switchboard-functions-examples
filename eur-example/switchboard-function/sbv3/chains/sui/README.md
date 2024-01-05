<div align="center">
  <a href="#">
    <img height="170" src="https://github.com/switchboard-xyz/sbv2-core/raw/main/website/static/img/icons/switchboard/avatar.svg" />
  </a>

  <h1>Switchboard Sui</h1>

  <p>Switchboard's Sui Implementation</p>

  <p>
	  <a href="https://www.npmjs.com/package/@switchboard-xyz/sui.js">
      <img alt="NPM Badge" src="https://img.shields.io/github/package-json/v/switchboard-xyz/sbv2-sui?color=red&filename=javascript%2Fsui.js%2Fpackage.json&label=%40switchboard-xyz%2Fsui.js&logo=npm">
    </a>
  </p>
  <p>
    <a href="https://discord.gg/switchboardxyz">
      <img alt="Discord" src="https://img.shields.io/discord/841525135311634443?color=blueviolet&logo=discord&logoColor=white">
    </a>
    <a href="https://twitter.com/switchboardxyz">
      <img alt="Twitter" src="https://img.shields.io/twitter/follow/switchboardxyz?label=Follow+Switchboard" />
    </a>
  </p>

  <h4>
    <strong>Npm: </strong><a href="https://www.npmjs.com/package/@switchboard-xyz/sui.js">npmjs.com/package/@switchboard-xyz/sui.js</a>
  </h4>
  <h4>
    <strong>Typedocs: </strong><a href="https://docs.switchboard.xyz/api/@switchboard-xyz/sui.js">docs.switchboard.xyz/api/@switchboard-xyz/sui.js</a>
  </h4>
  <h4>
    <strong>Sbv2 Sui SDK: </strong><a href="https://github.com/switchboard-xyz/sbv2-sui">github.com/switchboard-xyz/sbv2-sui</a>
  </h4>
</div>

## Install

### Install fresh cli:

```bash
cargo install --locked --git https://github.com/MystenLabs/sui.git --branch devnet sui
```

### Troubleshooting:

Take a look at install [docs](https://docs.sui.io/devnet/build/install)

### Check addresses

```bash
sui client addresses #  (it'll tell you which one is active)
sui client switch --address <existing_adddress>  #(updates the current used account)
```

### Generate a new address with cli

```bash
sui client new-address ed25519
```

### Check the secrets

```bash
vi ~/.sui/sui_config/sui.keystore
```

## Deploy It

1. open `switchboard_std/Move.toml`
2. remove `published-at = "<ADDRESS>"` and replace `switchboard_std = "<ADDRESS>"` with `switchboard_std = "0x0"`
3. publish switchboard library

```bash
cd swithcboard_std
sui client publish --gas-budget 500000000 --skip-dependency-verification
```

4. Scan the results for `"packageId": String("SOME_ADDRESS")`
5. Copy the address and add it back in the `sources/switchboard_std/Move.toml` as `switchboard_std = "<NEW_ADDRESS>"` and add `published-at = "<NEW_ADDRESS>"` in the top section where previously removed.
6. Open `switchboard_std/Move.toml` and update `switchboard_std` address to be the `<NEW_ADDRESS>` value from recent publish.
7. Publish switchboard

```bash
cd switchboard
sui client publish --gas-budget 500000000 --skip-dependency-verification
```

Lastly, can success results for `"packageId": String("SOME_NEW_ADDRESS")`, that'll be the address for switchboard business logic.

## Upgrading

For understanding upgradability on Sui, first check out the sui docs on how it works https://docs.sui.io/devnet/build/package-upgrades
