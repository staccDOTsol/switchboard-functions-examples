#!/bin/bash

# MISC
bold_text=$(tput bold)
normal_text=$(tput sgr0)

# SWITCHBOARD INDEXER PROJECT
GCP_INDEXER_PROJECT="switchboard-indexers"
GCP_INDEXER_REGION="us-central1"
GCP_INDEXER_CLUSTER="internal-apps"
GCP_INDEXER="gcloud container clusters get-credentials ${GCP_INDEXER_CLUSTER} --region ${GCP_INDEXER_REGION} --project ${GCP_INDEXER_PROJECT}"

# APTOS
GCP_APTOS_TESTNET_PROJECT="sbv2-aptos-testnet"
GCP_APTOS_TESTNET_REGION="europe-west1"
GCP_APTOS_TESTNET_CLUSTER="eu-testnet"
GCP_APTOS_TESTNET="gcloud container clusters get-credentials ${GCP_APTOS_TESTNET_CLUSTER} --region ${GCP_APTOS_TESTNET_REGION} --project ${GCP_APTOS_TESTNET_PROJECT}"

GCP_APTOS_MAINNET_PROJECT="sbv2-aptos-mainnet"
GCP_APTOS_MAINNET_REGION="europe-west1"
GCP_APTOS_MAINNET_CLUSTER="eu-mainnet"
GCP_APTOS_MAINNET="gcloud container clusters get-credentials ${GCP_APTOS_MAINNET_CLUSTER} --region ${GCP_APTOS_MAINNET_REGION} --project ${GCP_APTOS_MAINNET_PROJECT}"

# NEAR
GCP_NEAR_TESTNET_PROJECT="sbv2-near-testnet"
GCP_NEAR_TESTNET_REGION="europe-west1"
GCP_NEAR_TESTNET_CLUSTER="eu-testnet"
GCP_NEAR_TESTNET="gcloud container clusters get-credentials ${GCP_NEAR_TESTNET_CLUSTER} --region ${GCP_NEAR_TESTNET_REGION} --project ${GCP_NEAR_TESTNET_PROJECT}"

GCP_NEAR_MAINNET_PROJECT="sbv2-near-mainnet"
GCP_NEAR_MAINNET_REGION="europe-west1"
GCP_NEAR_MAINNET_CLUSTER="eu-mainnet"
GCP_NEAR_MAINNET="gcloud container clusters get-credentials ${GCP_NEAR_MAINNET_CLUSTER} --region ${GCP_NEAR_MAINNET_REGION} --project ${GCP_NEAR_MAINNET_PROJECT}"

# SOLANA
GCP_SOLANA_DEVNET_PROJECT="switchboard-devnet"
GCP_SOLANA_DEVNET_REGION="europe-west1"
GCP_SOLANA_DEVNET_CLUSTER="eu-devnet"
GCP_SOLANA_DEVNET="gcloud container clusters get-credentials ${GCP_SOLANA_DEVNET_CLUSTER} --region ${GCP_SOLANA_DEVNET_REGION} --project ${GCP_SOLANA_DEVNET_PROJECT}"

GCP_SOLANA_MAINNET_PROJECT="switchboard-mainnet"
GCP_SOLANA_MAINNET_REGION="europe-west2"
GCP_SOLANA_MAINNET_CLUSTER="solana-mainnet"
GCP_SOLANA_MAINNET="gcloud container clusters get-credentials ${GCP_SOLANA_MAINNET_CLUSTER} --region ${GCP_SOLANA_MAINNET_REGION} --project ${GCP_SOLANA_MAINNET_PROJECT}"

# STARKNET
GCP_STARKNET_TESTNET_PROJECT="sbv2-starknet-testnet"
GCP_STARKNET_TESTNET_REGION="europe-west1"
GCP_STARKNET_TESTNET_CLUSTER="starknet-testnet"
GCP_STARKNET_TESTNET="gcloud container clusters get-credentials ${GCP_STARKNET_TESTNET_CLUSTER} --region ${GCP_STARKNET_TESTNET_REGION} --project ${GCP_STARKNET_TESTNET_PROJECT}"

# COREDAO
GCP_COREDAO_TESTNET_PROJECT="sbv2-coredao-testnet"
GCP_COREDAO_TESTNET_REGION="europe-west1"
GCP_COREDAO_TESTNET_CLUSTER="coredao-testnet"
GCP_COREDAO_TESTNET="gcloud container clusters get-credentials ${GCP_COREDAO_TESTNET_CLUSTER} --region ${GCP_COREDAO_TESTNET_REGION} --project ${GCP_COREDAO_TESTNET_PROJECT}"

# SUI
GCP_SUI_TESTNET_PROJECT="sbv2-sui-testnet"
GCP_SUI_TESTNET_REGION="europe-west1"
GCP_SUI_TESTNET_CLUSTER="eu-testnet"
GCP_SUI_TESTNET="gcloud container clusters get-credentials ${GCP_SUI_TESTNET_CLUSTER} --region ${GCP_SUI_TESTNET_REGION} --project ${GCP_SUI_TESTNET_PROJECT}"


function gswitch {
  echo "gswitch has been deprecated - please migrate to k8s_switch"
  k8s_switch "$@"
}

function k8s_switch {
  local help_text="\n${bold_text}DESCRIPTION:${normal_text}\nSwitch the kubernetes cluster given a chain and cluster\n\n${bold_text}USAGE:${normal_text}\nk8s_switch [arbitrum|aptos|aurora|coredao|near|optimism|solana|starknet|sui] [devnet|testnet|mainnet]\n\n${bold_text}EXAMPLE:${normal_text}\nk8s_switch solana mainnet\nk8s_switch aptos testnet"

  case $1 in
  indexer|admin|task-runner|chat-api)
    eval "${GCP_INDEXER}"
    return 0
    ;;
  aptos)
    case $2 in
      testnet)
        eval "${GCP_APTOS_TESTNET}"
        ;;
      mainnet)
        eval "${GCP_APTOS_MAINNET}"
        ;;
      *)
        echo "ERROR: cluster must be testnet or mainnet" >> /dev/stderr
        echo "${help_text}"
        return 1
        ;;
    esac
      ;;
  near)
    case $2 in
      testnet)
        eval "${GCP_NEAR_TESTNET}"
        ;;
      mainnet)
        eval "${GCP_NEAR_MAINNET}"
        ;;
      *)
        echo "ERROR: cluster must be testnet or mainnet" >> /dev/stderr
        echo "${help_text}"
        return 1
        ;;
    esac
    ;;
  solana)
    case $2 in
      devnet)
        eval "${GCP_SOLANA_DEVNET}"
        ;;
      mainnet)
        eval "${GCP_SOLANA_MAINNET}"
        ;;
      *)
        echo "ERROR: cluster must be devnet or mainnet" >> /dev/stderr
        echo "${help_text}"
        return 1
        ;;
    esac
    ;;
  starknet)
    case $2 in
      testnet)
        eval "${GCP_STARKNET_TESTNET}"
        ;;
      *)
        echo "ERROR: cluster must be testnet" >> /dev/stderr
        echo "${help_text}"
        return 1
        ;;
    esac
    ;;
  sui)
    case $2 in
      testnet)
        eval "${GCP_SUI_TESTNET}"
        ;;
      *)
        echo "ERROR: cluster must be testnet" >> /dev/stderr
        echo "${help_text}"
        return 1
        ;;
    esac
      ;;
  coredao)
    case $2 in
      testnet)
        eval "${GCP_COREDAO_TESTNET}"
        ;;
      *)
        echo "ERROR: cluster must be testnet" >> /dev/stderr
        echo "${help_text}"
        return 1
        ;;
    esac
    ;;
  arbitrum)
    case $2 in
      testnet)
        az aks get-credentials -g Default -n functions-arbitrum-testnet
        ;;
      mainnet)
        az aks get-credentials -g Default -n functions-arbitrum-mainnet
        ;;
      *)
        echo "ERROR: cluster must be testnet or mainnet" >> /dev/stderr
        echo "${help_text}"
        return 1
        ;;
    esac
    ;;
  optimism)
    case $2 in
      testnet)
        az aks get-credentials -g Default -n functions-optimism-testnet
        ;;
      # mainnet)
      #   az aks get-credentials -g Default -n functions-optimism-mainnet
      #   ;;
      *)
        echo "ERROR: cluster must be testnet" >> /dev/stderr
        echo "${help_text}"
        return 1
        ;;
    esac
    ;;
  aurora)
    case $2 in
      testnet)
        az aks get-credentials -g Default -n functions-aurora-testnet
        ;;
      # mainnet)
      #   az aks get-credentials -g Default -n functions-aurora-mainnet
      #   ;;
      *)
        echo "ERROR: cluster must be testnet" >> /dev/stderr
        echo "${help_text}"
        return 1
        ;;
    esac
    ;;
  sb-internal)
    az aks get-credentials -g default -n sb-internal
    ;;
  multi)
    az aks get-credentials -g Default -n multichain-south
    ;;
  *)
    echo "ERROR: chain must be arbitrum, aptos, aurora, coredao, near, optimism, solana, starknet, or sui" >> /dev/stderr
    echo "${help_text}"
    return 1
    ;;
  esac
}

function oracle_logs {
  while true; do
    if [[ -z "$1" ]]; then
      kubectl logs -f -l app=oracle --all-containers --max-log-requests=100 --prefix=true "${@: 2}"; 
    else
      kubectl logs -f -l app=oracle --all-containers --max-log-requests=100 --prefix=true "${@: 2}" | grep "$1";
    fi;
  done
}

function crank_logs {
  while true; do
    if [[ -z "$1" ]]; then
      kubectl logs -f -l app=crank --all-containers --max-log-requests=100  --prefix=true "${@: 2}";
    else
      kubectl logs -f -l app=crank --all-containers --max-log-requests=100  --prefix=true "${@: 2}" | grep "$1";
    fi;
  done
}

function task_runner_logs {
  k8s_switch task-runner
  pod_log task-runner-deployment "" "${@: 1}"
}

function task_runner_update {
  k8s_switch task-runner
  kubectl apply -f ./charts/switchboard-internal/templates/task-runner-deployment.yaml
}

function chat_logs {
  k8s_switch task-runner
  pod_log chat-api-deployment "" "${@: 1}"
}

function restart_chat_api {
  k8s_switch task-runner
  kubectl rollout restart deployment chat-api-deployment -n default
}
function k8s-rm-evicted-pods {
  for i in $(kubectl get po | grep "Evicted" | cut -d" " -f1); do 
    kubectl delete po "${i}"; 
  done
}

function pod_grep {
  kubectl get pods -l app=oracle | awk '{print $1}' | grep --color=never -E "$1" | head -1
}

function pod_log {
  local help_text="\n${bold_text}DESCRIPTION:${normal_text}\nView the logs for a given pod\n\n${bold_text}USAGE:${normal_text}\npod_log [POD_NAME]\n\n${bold_text}EXAMPLE:${normal_text}\npod_log permissioned-oracle-idx-1 --previous\npod_log permissioned-oracle-idx-1 -f"
  if [[ -z "$1" ]]; then 
      echo "${help_text}"
      return 1
  fi;

  pod_name="$(pod_grep "$1")"
  if [[ -z "${pod_name}" ]]; then
    echo "ERROR: failed to find pod for $1" >> /dev/stderr
    printf "\nPODS:\n"
    kubectl get pods | awk '{print $1}' | tail -n +2
    echo "${help_text}"
    return 1
  fi;

  echo "${pod_name}"
  while true; do
    if [[ -z "$2" ]]; then
      kubectl logs -f "${pod_name}" "${@: 2}"
    else
      kubectl logs -f "${pod_name}" "${@: 2}" | grep "$2";
    fi;
  done;
}

function pod_exec {
  local help_text="\n${bold_text}DESCRIPTION:${normal_text}\nOpen a shell in the selected pod\n\n${bold_text}USAGE:${normal_text}\npod_exec [POD_NAME]\n\n${bold_text}EXAMPLE:${normal_text}\npod_exec permissioned-oracle-idx-1"
  if [[ -z "$1" ]]; then 
      echo "${help_text}"
  else
    pod_name="$(pod_grep "$1")"
    if [[ -z "${pod_name}" ]]; then 
      echo "ERROR: failed to find pod for $1" >> /dev/stderr
      printf "\nPODS:\n"
      kubectl get pods | awk '{print $1}' | tail -n +2
      echo "${help_text}"
      return 1
    fi;
    echo "${pod_name}"
    sleep 1
    kubectl exec -it "${pod_name}" -- /bin/bash
  fi;
}

function pod_restart {
  local help_text="\n${bold_text}DESCRIPTION:${normal_text}\nRestart a specific pod(s) matching a grep pattern \n\n${bold_text}USAGE:${normal_text}\npod_restart [GREP_STRING]\n\n${bold_text}EXAMPLE:${normal_text}\npod_restart function-simulator"
  local search_str=$1

  if [[ -z "${search_str}" ]]; then
    echo "Failed to provide search string"
    echo "${help_text}"
    return 1
  fi

  pods=$(pod_grep "${search_str}")
  while IFS= read -r line; do
    if [[ -n "${line}" ]]; then
      kubectl delete pod "${line}"
    fi
  done <<< "${pods}"
}

function restart_oracles {
  local help_text="\n${bold_text}DESCRIPTION:${normal_text}\nRestart all pods in a cluster which have an app=oracle \n\n${bold_text}USAGE:${normal_text}\nrestart_oracles [arbitrum|aptos|aurora|coredao|near|optimism|solana|starknet|sui] [devnet|testnet|mainnet]\n\n${bold_text}EXAMPLE:${normal_text}\nrestart_oracles solana mainnet\nrestart_oracles aptos testnet"
  local chain=$1
  local network=$2

  local do_force_restart="${3:-''}"

  if ! k8s_switch "${chain}" "${network}"; then
    echo "Failed to set GCP project and cluster"
    return 1
  fi

  if [[ "${do_force_restart}" == "-f" ]]; then
    ALL_SWITCHBOARD_PODS=($(kubectl get pods -o json | jq -r '.items[] | select(.metadata.name | contains("oracle") or contains("crank")) | .metadata.name' | tr '\n' ' '))
    echo "Deleting all pods"
    for i in "${ALL_SWITCHBOARD_PODS[@]}"
    do
      kubectl delete pod "${i}" || true
    done
  else
    ALL_SWITCHBOARD_DEPLOYMENTS=($(kubectl get deployments -o json | jq -r '.items[] | select(.metadata.name | contains("oracle") or contains("crank")) | .metadata.name' | tr '\n' ' '))
    echo "Restarting all pods"
    for i in "${ALL_SWITCHBOARD_DEPLOYMENTS[@]}"
    do
      kubectl rollout restart deployment "${i}" || true
    done
  fi
}