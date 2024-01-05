# CLI Automation

You may need to use the CLI to quickly update a batch of data feeds. The
following is a boilerplate bash script with the flags:

- `-n [devnet/mainnet]` to change the network
- `-k [filesystem path]` to load a keypair from a filesystem path

**Usage**

```bash
./cli-automation.sh -n devnet -k "~/.config/solana/id.json"
```

## Script

```bash
#!/bin/bash

set -e # instructs bash to immediately exit if any command [1] has a non-zero exit status

stty sane # dont show backspace char during prompts

declare -a feeds=(
  "8SXvChNYFhRq4EZuZvnhjrB3jJRQCv4k3P4W6hesH3Ee" # BTC
  "GvDMxPzN1sCj7L26YDK2HnMRXEQmQ2aemov8YBtPS7vR" # SOL
  "HNStfhaLnqwF2ZtJUizaA9uHDAVB976r2AgTUx9LrdEo" # ETH
  # ... add the rest of your aggregator pubkeys
)

network_id="devnet"
keypair_path="$HOME/.config/solana/id.json"

while getopts 'n:k:' OPTION; do
  case "$OPTION" in
    n)
      network_id="$OPTARG"
      if [[ "$network_id" != "devnet" && "$network_id" != "mainnet" ]]; then
        echo "invalid Network ID ($network_id) - [devnet or mainnet]"
        exit 1
      fi
      ;;
    k)
      keypair_path="$OPTARG"
      ;;
    ?)
      echo "unrecognized option"
      exit 1
      ;;
  esac
done

pubkey=$(solana-keygen pubkey "$keypair_path")

echo "Network: $network_id"
echo "Keypair Path: $keypair_path"
echo "Public Key: $pubkey"

for feed in "${feeds[@]}"; do
    # Add your sbv2 logic here
    sbv2 solana aggregator print "$feed" --networkId "$network_id"
done
```
