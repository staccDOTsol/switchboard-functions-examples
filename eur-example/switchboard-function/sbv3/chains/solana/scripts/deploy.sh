#!/bin/bash

Color_Off='\033[0m'  
Red='\033[0;31m'
Green='\033[0;32m'
Blue='\033[0;34m'
Purple='\033[0;35m'

function display_help {
  printf "\nDescription:\nCommand line script to deploy the Switchboard program\n\nUsage:\n%s [-m]\n\nOptions:\n" "$(basename \$0)"
  echo "-m, deploy the program to mainnet"
  printf "\n\nExample:\n\t%s -m\n" "$(basename \$0)"
}

function get_solana_version {
  solana --version | grep -oE 'solana-cli [0-9]+\.[0-9]+\.[0-9]+' | awk '{print $2}' || echo 'stable'
}

cluster="devnet"
while getopts 'm' OPTION; do
  case "${OPTION}" in
    m)
      cluster="mainnet"
      ;;
    ?)
      display_help
      exit 1
      ;;
    *)
      display_help
      exit 1
      ;;
  esac
done
shift "$(($OPTIND -1))"

# Sanity check the cluster variable
if [[ "${cluster}" != "devnet" ]]; then
    echo -e "${Red}CLUSTER must be devnet${Color_Off}"
    exit 1
fi

solana_version=$(get_solana_version)

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
"${SCRIPT_DIR}/version.sh"

trap 'echo "Error occurred. Reverting solana version ..."; solana-install init "${solana_version}"; exit 1' ERR

avm use latest
solana-install init 1.16.7

if [[ "${cluster}" = "devnet" ]]; then
    # Build the .so file
    anchor build -- --features devnet

    solana-install init 1.14.16

    # Deploy the oracle program
    solana program deploy --program-id SW1TCH7qEPTdLsDHRgPuMQjbQxKdH2aBStViMFnt64f \
        --upgrade-authority "${HOME}/switchboard_environments_v2/devnet/upgrade_authority/upgrade_authority.json" \
        --url "https://switchbo-switchbo-6225.devnet.rpcpool.com/f6fb9f02-0777-498b-b8f5-67cbb1fc0d14" \
        ./target/deploy/switchboard_v2.so
    # Deploy the oracle IDL
    anchor idl upgrade \
        --filepath target/idl/switchboard_v2.json \
        --provider.cluster "https://switchbo-switchbo-6225.devnet.rpcpool.com/f6fb9f02-0777-498b-b8f5-67cbb1fc0d14" \
        --provider.wallet "${HOME}/switchboard_environments_v2/devnet/upgrade_authority/upgrade_authority.json" \
        SW1TCH7qEPTdLsDHRgPuMQjbQxKdH2aBStViMFnt64f
    echo -e "${Green} \xE2\x9C\x94 ${cluster} program deployed to SW1TCH7qEPTdLsDHRgPuMQjbQxKdH2aBStViMFnt64f ${Color_Off}"

    # Deploy the attestation program
    solana program deploy --program-id sbattyXrzedoNATfc4L31wC9Mhxsi1BmFhTiN8gDshx \
        --upgrade-authority "${HOME}/switchboard_environments_v2/devnet/upgrade_authority/upgrade_authority.json" \
        --url "https://switchbo-switchbo-6225.devnet.rpcpool.com/f6fb9f02-0777-498b-b8f5-67cbb1fc0d14" \
        ./target/deploy/switchboard_attestation_program.so
    # Deploy the oracle IDL
    anchor idl upgrade \
        --filepath target/idl/switchboard_attestation_program.json \
        --provider.cluster "https://switchbo-switchbo-6225.devnet.rpcpool.com/f6fb9f02-0777-498b-b8f5-67cbb1fc0d14" \
        --provider.wallet "${HOME}/switchboard_environments_v2/devnet/upgrade_authority/upgrade_authority.json" \
        sbattyXrzedoNATfc4L31wC9Mhxsi1BmFhTiN8gDshx
    echo -e "${Green} \xE2\x9C\x94 ${cluster} program deployed to sbattyXrzedoNATfc4L31wC9Mhxsi1BmFhTiN8gDshx ${Color_Off}"
# else
#     # Build the .so file
#     anchor build

#     solana-install init 1.14.16

#     # Deploy the program
#     solana program deploy --program-id SW1TCH7qEPTdLsDHRgPuMQjbQxKdH2aBStViMFnt64f \
#         --upgrade-authority "${HOME}/switchboard_environments_v2/mainnet/upgrade_authority/upgrade_authority.json" \
#         --url "https://switchboard.rpcpool.com/ec20ad2831092cfcef66d677539a" \
#         ./target/deploy/switchboard_v2.so
#     # Deploy the IDL
#     anchor idl upgrade \
#         --filepath target/idl/switchboard_v2.json \
#         --provider.cluster "https://switchboard.rpcpool.com/ec20ad2831092cfcef66d677539a" \
#         --provider.wallet "${HOME}/switchboard_environments_v2/mainnet/upgrade_authority/upgrade_authority.json" \
#         SW1TCH7qEPTdLsDHRgPuMQjbQxKdH2aBStViMFnt64f
#     echo -e "${Green} \xE2\x9C\x94 ${cluster} program deployed to SW1TCH7qEPTdLsDHRgPuMQjbQxKdH2aBStViMFnt64f ${Color_Off}"

#     # Deploy the attestation program
#     solana program deploy --program-id sbattyXrzedoNATfc4L31wC9Mhxsi1BmFhTiN8gDshx \
#         --upgrade-authority "${HOME}/switchboard_environments_v2/mainnet/upgrade_authority/upgrade_authority.json" \
#         --url "https://switchboard.rpcpool.com/ec20ad2831092cfcef66d677539a" \
#         ./target/deploy/switchboard_attestation_program.so
#     # Deploy the oracle IDL
#     anchor idl upgrade \
#         --filepath target/idl/switchboard_attestation_program.json \
#         --provider.cluster "https://switchboard.rpcpool.com/ec20ad2831092cfcef66d677539a" \
#         --provider.wallet "${HOME}/switchboard_environments_v2/mainnet/upgrade_authority/upgrade_authority.json" \
#         sbattyXrzedoNATfc4L31wC9Mhxsi1BmFhTiN8gDshx
#     echo -e "${Green} \xE2\x9C\x94 ${cluster} program deployed to sbattyXrzedoNATfc4L31wC9Mhxsi1BmFhTiN8gDshx ${Color_Off}"
fi

trap - ERR # remove trap
solana-install init "${solana_version}"
