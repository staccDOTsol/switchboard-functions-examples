#!/bin/bash

echo ''
echo '========================================================================'
echo '  Installing scarb.'
echo '========================================================================'
curl --proto '=https' --tlsv1.2 -sSf https://docs.swmansion.com/scarb/install.sh | sh
# curl --proto '=https' --tlsv1.2 -sSf https://docs.swmansion.com/scarb/install.sh | sh -s -- -v 0.7.0

echo ''
echo '========================================================================'
echo '  Installing starknet-foundry.'
echo '========================================================================'
curl --proto '=https' -L https://raw.githubusercontent.com/foundry-rs/starknet-foundry/master/scripts/install.sh | sh
# curl --proto '=https' -L https://raw.githubusercontent.com/foundry-rs/starknet-foundry/master/scripts/install.sh | sh -s -- -v 0.6.0

# echo ''
# echo '========================================================================'
# echo '  Chekout remote cairo repo.'
# echo '========================================================================'
# git submodule update --init --remote
# cd cairo
#
# echo ''
# echo '========================================================================'
# echo '  Install the cairo language server VSCode extension.'
# echo '========================================================================'
# cd vscode-cairo && npm install && npx vsce package && code --install-extension cairo1*.vsix
# cd ../..
#
# echo ''
# echo '========================================================================'
# echo '  Cleaning up remote cairo repo.'
# echo '========================================================================'
# sudo rm -rf cairo

# Restart the shell to contain the new paths.
exec $SHELL
