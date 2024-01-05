#!/bin/bash

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../utils/utils.sh"

set -euo pipefail

setup_base_deps

if [ ! -x "$(command -v near)" ]; then
  echo -e "${Green}Installing NEAR CLI ...${Color_Off}"
  npm install --global near-cli
fi
echo "NEAR CLI Version: $(near --version)"