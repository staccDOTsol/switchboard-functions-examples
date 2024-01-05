# Switchboard CLI

- [Install](#install-instructions)
- [Architecture](#architecture)
  - [Structure](#structure)
  - [BaseCommands](#base-commands)
- [Secrets](#secrets)
- [Custom Commands](#custom-commands)
- [New Chain Integrations](#new-chain-integrations)
- [JSON](#json)

## Install Instructions

Clone the `sbv2-core` repository and install the dependencies

```bash
git clone --recurse-submodules https://github.com/switchboard-xyz/sbv2-core.git
cd sbv2-core
pnpm install
pnpm build
```

Then use `npm link` to add the sbv2 binary to your $PATH

```bash
cd cli
npm link
```

Then verify the installation

```bash
$ sbv2 --version
@switchboard-xyz/cli/2.1.33 darwin-arm64 node-v18.13.0
$ which sbv2
/Users/gally/.nvm/versions/node/v18.13.0/bin/sbv2
```

### Development

You can fork the CLI and add new custom commands. To rapidly test new commands
you will need to rebuild (`pnpm build`) the project each time you make a change
or run `pnpm watch` in a new shell in order to rebuild the project each time tsc
detects a filechange.

## Architecture

The CLI uses the [oclif](https://oclif.io/docs/introduction) framework from
salesforce to handle the argument and flag parsing.

- [Command Arguments](https://oclif.io/docs/args) - Read how oclif parses
  command arguments. **Note:** Arguments should be limited to pubkeys or
  identifiers and rely on flags for most user input.
- [Command Flags](https://oclif.io/docs/flags) - Read the oclif docs on how it
  parses flags and the available options you can use

### Structure

OCLIF will parse the `src/commands` directory and create a command for each
typescript file found.

For example, a typescript file located in
`src/commands/solana/aggregator/create.ts` will create a command with the syntax
`sbv2 solana aggregator create` (or `sbv2 solana:aggregator:create`, both are
valid).

> **Note** <br /> You can hide any command from the outputted markdown by adding
> `static hidden = true;` to the command's class.

### Base Commands

Each command gets inherited from the top level Base Command
[src/BaseCommand.ts](https://github.com/switchboard-xyz/sbv2-core/blob/main/cli/src/BaseCommand.ts)
which allows us to share functionality such as:

- **CLI Config**: Loads the user's config from their application cache
  dependency (Operating System dependent). This allows users to save a default
  RPC url for each chain and network. See
  [oclif Configuration Docs](https://oclif.io/docs/config) for a list of
  availble configuration parameters.
- **Logging Config**: Control the logging level with `--silent` or `--verbose`

Each chain then gets their own BaseCommand, BaseCommandWithSigner, and
BaseCommandWithoutSigner which lets us share functionality across each chain
commands. No commands **_should_** inherit a chains BaseCommand and instead
should use either BaseCommandWithSigner or BaseCommandWithoutSigner to
distinguish whether the command will require the user to pay for a transaction.

| Chain  | BaseCommand                                                                                                                           | WithoutSigner                                                                                                                                          | WithSigner                                                                                                                                    |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Solana | [SolanaBaseCommand (src/solana/BaseCommand.ts)](https://github.com/switchboard-xyz/sbv2-core/blob/main/cli/src/solana/BaseCommand.ts) | [SolanaWithoutSignerBaseCommand (src/solana/WithoutSigner.ts)](https://github.com/switchboard-xyz/sbv2-core/blob/main/cli/src/solana/WithoutSigner.ts) | [SolanaWithSignerBaseCommand (src/solana/WithSigner.ts)](https://github.com/switchboard-xyz/sbv2-core/blob/main/cli/src/solana/WithSigner.ts) |
| NEAR   | [NearBaseCommand (src/near/BaseCommand.ts)](https://github.com/switchboard-xyz/sbv2-core/blob/main/cli/src/near/BaseCommand.ts)       | [NearWithoutSignerBaseCommand (src/near/WithoutSigner.ts)](https://github.com/switchboard-xyz/sbv2-core/blob/main/cli/src/near/WithoutSigner.ts)       | [NearWithSignerBaseCommand (src/near/WithSigner.ts)](https://github.com/switchboard-xyz/sbv2-core/blob/main/cli/src/near/WithSigner.ts)       |
| Aptos  | [AptosBaseCommand (src/aptos/BaseCommand.ts)](https://github.com/switchboard-xyz/sbv2-core/blob/main/cli/src/aptos/BaseCommand.ts)    | [AptosWithoutSignerBaseCommand (src/aptos/WithoutSigner.ts)](https://github.com/switchboard-xyz/sbv2-core/blob/main/cli/src/aptos/WithoutSigner.ts)    | [AptosWithSignerBaseCommand (src/aptos/WithSigner.ts)](https://github.com/switchboard-xyz/sbv2-core/blob/main/cli/src/aptos/WithSigner.ts)    |

#### Example

The
[SolanaBaseCommand (src/solana/BaseCommand.ts)](https://github.com/switchboard-xyz/sbv2-core/blob/main/cli/src/solana/BaseCommand.ts)
exposes the flags `--mainnetBeta`, `--cluster`, `--rpcUrl`, `--programId`, and
`--commitment` which means any solana command will also inherit these flags and
allow the user more control over the commands execution.

The
[SolanaWithSignerBaseCommand (src/solana/WithSigner.ts)](https://github.com/switchboard-xyz/sbv2-core/blob/main/cli/src/solana/WithSigner.ts)
then lets the user specify either a `--keypair` flag which is a path to the
users filesystem wallet or `--ledger` and `--ledgerPath` which lets the user use
a ledger to pay for any transactions. The WithSignerBaseCommand will create and
expose the SwitchboardProgram class from the solana.js SDK so each command that
inherits this class will just contain the logic for that individual command
without needing to load a keypair each time.

## Secrets

The CLI supports loading secrets from

- [FilesystemProvider](https://github.com/switchboard-xyz/sbv2-core/blob/main/cli/src/providers/fs.ts):
  Load a secret from a filesystem path
- [GcpProvider](https://github.com/switchboard-xyz/sbv2-core/blob/main/cli/src/providers/gcp.ts):
  Load a secret from a GCP secret
- [AwsProvider](https://github.com/switchboard-xyz/sbv2-core/blob/main/cli/src/providers/aws.ts):
  Load a secret from AWS
- Ledger: Load a secret using a chains ledger HwTransport class (Not supported
  by all chains)

## Custom Commands

To create a custom command, first define the BaseCommand you will need. This
should be either the WithoutSigner or WithSigner for each chain. If I wanted to
add a new Solana command that will submit an on-chain transaction then I should
chose to inherit the
[SolanaWithSignerBaseCommand (src/solana/WithSigner.ts)](https://github.com/switchboard-xyz/sbv2-core/blob/main/cli/src/solana/WithSigner.ts).

Next create the typescript file and inherit your chosen BaseCommand. I will be
adding a new command that sets an aggregators config on solana so I will create
the file `src/commands/solana/aggregator/config.ts` which will expose the
command `sbv2 solana aggregator config`.

The boilerplate code will look something like this:

```typescript
import { SolanaWithSignerBaseCommand as BaseCommand } from "../solana";

import { Args, Flags } from "@oclif/core";

export default class AggregatorSet extends BaseCommand {
  static description = "set an aggregator's config";

  static hidden = true;

  static flags = {
    ...BaseCommand.flags,
    myBooleanFlag: Flags.string({
      description: "description for my new boolean flag",
    }),
    myStringFlag: Flags.string({
      description: "description for my new flag",
      default: "",
    }),
    myIntegerFlag: Flags.integer({
      description: "description for my new integer flag",
      default: 0,
    }),
  };

  static args = {
    aggregatorKey: Args.string({
      description: "public key of the aggregator account",
      required: true,
    }),
  };

  async run() {
    const { args, flags } = await this.parse(AggregatorSet);
  }

  async catch(error: any) {
    super.catch(error, "aggregator set command failed");
  }
}
```

As you can see above we have one argument with three flags so the user would
invoke the command like so:

```bash
$ sbv2 solana aggregator set $AGGREGATOR_KEY \
    --myBooleanFlag \
    --myStringFlag "my string" \
    --myIntegerFlag 0 \
    --keypair /path/to/user/keypair.json
```

Continue adding your custom logic to create the user's transaction.

> **Note** <br /> In order to support ledger devices we must submit all
> transactions with `const signature = await this.signAndSend(txnObject)`. See
> the method in
> [SolanaWithSignerBaseCommand (src/solana/WithSigner.ts)](https://github.com/switchboard-xyz/sbv2-core/blob/main/cli/src/solana/WithSigner.ts#L112)

## New Chain Integrations

To add a new chain integration, mimic one of the other chain integrations and
add the following base commands in `src/newChain`:

- **BaseCommand**: Add the flags to load a chain with a given `--rpcUrl`,
  `--network`, and maybe a `--programId` flag. This command should contain the
  bulk of the logic to load a set of accounts or parse a keypair from a
  filesystem path or GCP Secret path.
- **WithoutSigner**: Sets the `hasSigner` command class member to false and
  loads the chain with a READ ONLY keypair.
- **WithSigner**: Sets the `hasSigner` command class member to true, then loads
  a secret from a `--keypair` or `--ledger` flag and loads the chain with the
  user defined keypair.

Once you have these defined you can start creating chain specific commands under
`src/commands/newChain` with each inheriting from the WithoutSigner or
WithSigner BaseCommands.

Each chain will have its own logic for how to load the on-chain program but each
will need to load some user defined keypair.

## JSON

The sbv2 CLI supports outputting JSON which is handy for automation scripts as
it can be piped to jq.

A command class must have `static enableJsonFlag = true;` and return a JSON
object. The oclif framework will automatically suppress any console output
except for the returned value.

See [oclif JSON Docs](https://oclif.io/docs/json) for more information.
