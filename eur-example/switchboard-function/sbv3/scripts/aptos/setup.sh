#!/bin/bash

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../utils/utils.sh"

set -euo pipefail

setup_base_deps

if [ ! -x "$(command -v aptos)" ]; then
  pkg_manager=$(detect_package_manager)
  if [ "$pkg_manager" == "brew" ]; then
    echo -e "${Green}Installing Aptos from homebrew ...${Color_Off}"
    brew update && brew install aptos
  else
    echo -e "${Green}Installing Aptos ...${Color_Off}"
    curl -fsSL "https://aptos.dev/scripts/install_cli.py" | python3
  fi
fi
echo "Aptos Version: $(aptos --version)"

# TODO: Add steps to configure aptos config at root of this repository if it doesnt exist