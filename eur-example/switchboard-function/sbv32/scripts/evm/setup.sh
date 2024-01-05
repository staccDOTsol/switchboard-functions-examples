#!/bin/bash

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../utils/utils.sh"

set -euo pipefail

setup_base_deps

if ! which foundryup >/dev/null 2>&1; then
  echo -e "${Green}Installing Foundry ...${Color_Off}"
  curl -L https://foundry.paradigm.xyz | bash
fi
