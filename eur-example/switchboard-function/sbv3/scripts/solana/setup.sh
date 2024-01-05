#!/bin/bash

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../utils/utils.sh"

set -euo pipefail

setup_base_deps

if [ ! -x "$(command -v solana)" ]; then
  echo -e "${Green}Installing Solana ...${Color_Off}"
  sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
  echo "PATH=\"$HOME/.local/share/solana/install/active_release/bin:$PATH\"" >> ~/.zshrc
  export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
fi
echo "Solana Version: $(solana --version)"

if [ ! -x "$(command -v avm)" ]; then
  echo -e "${Green}Installing Anchor ...${Color_Off}"
  cargo install --git https://github.com/project-serum/anchor avm --locked --force
  avm install latest
  avm use latest
fi
echo "Anchor Version: $(anchor --version)"

# Setup keypair
find ~/.config/solana/id.json > /dev/null 2>&1 || solana-keygen new --no-bip39-passphrase -o ~/.config/solana/id.json > /dev/null 2>&1
default_payer=$(solana-keygen pubkey ~/.config/solana/id.json)
echo "Default Payer: $default_payer"