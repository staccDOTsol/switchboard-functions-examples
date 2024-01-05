# include `.env` file and export its env vars
# (-include to ignore error if it does not exist)
-include .env

# dependencies
update          :; forge update

# install proper solc version
solc            :; nix-env -f https://github.com/dapphub/dapptools/archive/master.tar.gz -iA solc-static-versions.solc_0_8_19

# build & test
build           :; forge build
build-optimised :; forge build --optimize
test-forge      :; forge test
test-gasreport 	:; forge test --gas-report
trace           :; forge test -vvv
clean           :; forge clean
snapshot        :; forge snapshot

# chmod scripts
scripts         :; chmod +x ./scripts/*

# fork mainnet with Hardhat
mainnet-fork    :; npx hardhat node --fork ${ETH_MAINNET_RPC_URL}

anvil :; anvil -m 'test test test test test test test test test test test junk'

# This is the private key of account from the mnemonic from the "make anvil" command
deploy-anvil :; @forge script script/${contract}.s.sol:Deploy${contract} --rpc-url http://localhost:8545  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 --broadcast 

