#!/bin/bash

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/utils/utils.sh"

set -euo pipefail

setup_base_deps
print_base_deps

# Chains
echo -e "${Blue}## Aptos${Color_Off}"
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/aptos/setup.sh"

echo -e "${Blue}## EVM${Color_Off}"
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/evm/setup.sh"

echo -e "${Blue}## NEAR${Color_Off}"
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/near/setup.sh"

echo -e "${Blue}## Solana${Color_Off}"
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/solana/setup.sh"

echo -e "${Blue}## Sui${Color_Off}"
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/sui/setup.sh"