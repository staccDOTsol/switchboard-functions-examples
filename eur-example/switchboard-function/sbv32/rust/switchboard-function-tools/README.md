<div align="center">

![Switchboard Logo](https://github.com/switchboard-xyz/core-sdk/raw/main/website/static/img/icons/switchboard/avatar.png)

# sb-func-tools

> A Rust CLI to help manage and debug your Switchboard Functions.

[![Crates.io Badge](https://img.shields.io/crates/v/sb-func-tools?label=sb-func-tools&logo=rust)](https://crates.io/crates/sb-func-tools)

[![Discord Badge](https://img.shields.io/discord/841525135311634443?color=blueviolet&logo=discord&logoColor=white)](https://discord.gg/switchboardxyz)

[![Twitter Badge](https://img.shields.io/twitter/follow/switchboardxyz?label=Follow+Switchboard)](https://twitter.com/switchboardxyz)

  <h4>
    <strong>Typedocs: </strong><a href="https://docs.rs/sb-func-tools">docs.rs/sb-func-tools</a>
  </h4>
  <h4>
    <strong>Switchboard Documentation: </strong><a href="https://docs.switchboard.xyz">docs.switchboard.xyz</a>
  </h4>
</div>

## Setup

```bash
cargo build
cargo install --path .
```

## Commands

### `decode`

You can pipe the last word emitted to the binary to decode the FunctionResult output.

**Example**

```bash
$ sb-func-tools decode -f output.json "FN_OUT: 7b2276657273696f6e223a302c2271756f7465223a5b5d2c22666e5f6b6579223a5b5d2c227369676e6572223a5b5d2c22666e5f726571756573745f6b6579223a5b5d2c22666e5f726571756573745f68617368223a5b5d2c22636861696e5f726573756c745f696e666f223a224e6f6e65227d"

{
  "version": 0,
  "quote": [],
  "fn_key": [],
  "signer": [],
  "fn_request_key": [],
  "fn_request_hash": [],
  "chain_result_info": "None"
}
```

**Usage**

```bash
Decodes a FunctionRunner result

Usage: sb-func-tools decode [OPTIONS] <FN_RESULT>

Arguments:
  <FN_RESULT>  The encoded FunctionRunner result. Should start with FN_OUT: abc...

Options:
  -f, --filepath [<FILEPATH>]  the location to write the decoded JSON result
  -h, --help                   Print help
```

## Development

```bash
cargo run -- docker measurement gallynaut/binance-oracle:latest
```
