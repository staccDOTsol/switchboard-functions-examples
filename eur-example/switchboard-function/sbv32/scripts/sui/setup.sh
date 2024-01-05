#!/bin/bash

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../utils/utils.sh"

set -euo pipefail

setup_base_deps

if [ ! -x "$(command -v sui)" ]; then
  echo -e "${Green}Installing Sui ...${Color_Off}"
  cargo install --locked --git https://github.com/MystenLabs/sui.git --branch devnet sui
fi
echo "Sui Version: $(sui --version)"

# TODO: Add steps to configure sui config at root of this repository if it doesnt exist