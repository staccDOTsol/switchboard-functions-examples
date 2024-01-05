# SDKs

Each chain integration gets its own public GitHub repo that is a submodule of
the sbv2-core repo.

- Clients
  - Javascript
  - Rust
  - Python
- Example contracts in Anchor/Solidity/etc

_NOTE:_ The CLI is maintained in the sbv2-core repo

## Clients

Each client should have code examples for

- Load the SwitchboardProgram
- Load / Read an Account
- Create an Aggregator
- Read an Aggregator
- Request an Aggregator Update
- Create a Queue / Crank
- Create an Oracle
- Create / Set Permissions
- Watch an Aggregator

## Example Contracts

TBD

- Setup scripts
- Basic walk-through

## Ideas

- Have each SDK maintain usage code blocks then have automation scripts to pull
  them all in to docusaurus
