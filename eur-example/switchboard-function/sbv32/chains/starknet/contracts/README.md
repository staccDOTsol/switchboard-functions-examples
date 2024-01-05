<a href="https://switchboard.xyz">
	<img width="100%" src="./.assets/switchboard_banner.png" alt="Switchboard Banner" />
</a>

# Starknet Program

[![](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

## Getting Started

### Environment

#### <b>Scarb</b>

[Scarb](https://docs.swmansion.com/scarb) is the project management tool for the Cairo language. Scarb manages your dependencies, compiles your projects and works as an extensible platform assisting in development.

```bash
# Install / upgrade environment tooling (Scarb / Foundry... etc)
❯ scripts/setup_workspace.sh

❯ scarb --version
scarb 2.3.0 (f306f9a91 2023-10-23)
cairo: 2.3.0 (https://crates.io/crates/cairo-lang-compiler/2.3.0)
sierra: 1.3.0

❯ snforge --version
forge 0.9.0
```

#### <b>VS Code</b>

Scarb comes prepackaged with Cairo compiler and language server - but if you're using VSCode you'll want to install the extension.

Instructions to do so can [be found here](https://github.com/starkware-libs/cairo/tree/main/vscode-cairo)

## Running Tests

```bash
❯ snforge test
    Updating git repository https://github.com/keep-starknet-strange/alexandria
    Updating git repository https://github.com/foundry-rs/starknet-foundry
   Compiling switchboard v0.0.0 (/Users/jessupjn/Documents/Switchboard/starknet/Scarb.toml)
    Finished release target(s) in 4 seconds
Collected 9 test(s) and 1 test file(s)
Running 9 test(s) from switchboard package
[PASS] switchboard::sb_traits::tests::math_test::u64_abs_diff
...
```
