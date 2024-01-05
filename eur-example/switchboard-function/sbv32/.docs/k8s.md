# Kubernetes Commands

Scripts and commands to help manage the kubernetes clusters

- [Kubernetes Commands](#kubernetes-commands)
  - [Setup Scripts](#setup-scripts)
  - [Usage](#usage)
    - [k8s_switch](#k8s_switch)
    - [pod_log](#pod_log)
    - [pod_restart](#pod_restart)
    - [restart_oracles](#restart_oracles)
  - [Change Cluster](#change-cluster)
  - [List Pods](#list-pods)
  - [View Logs](#view-logs)
    - [View a Single Pods Logs](#view-a-single-pods-logs)
    - [View all Logs for a Given App](#view-all-logs-for-a-given-app)
    - [Find a Specific Log](#find-a-specific-log)
  - [Restart a Pod](#restart-a-pod)
  - [Restart all oracle pods (Faster startup but with downtime)](#restart-all-oracle-pods-faster-startup-but-with-downtime)
  - [Investigate a Pod](#investigate-a-pod)

## Setup Scripts

Install the gcloud CLI:
[https://cloud.google.com/sdk/docs/install](https://cloud.google.com/sdk/docs/install)

Run the following command

```bash
gcloud components install gke-gcloud-auth-plugin
```

Add the following line to your `~/.bashrc` or `~/.zshrc` file, replacing the
path with the location of this directory

```bash
source $HOME/dev/switchboard/sbv3/scripts/devops/k8s-scripts.sh
export USE_GKE_GCLOUD_AUTH_PLUGIN=True
```

> **Note** <br /> Replace the path above with the location where you cloned the
> control-panel repository

Install the Azure CLI

```bash
brew update
brew install azure-cli
```

See [How to install the Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli) docs for more info.

## Usage

### k8s_switch

<pre>
<b>DESCRIPTION:</b>
Switch GCP Projects given a chain and cluster

<b>USAGE:</b>
k8s_switch [arbitrum|aptos|aurora|coredao|near|optimism|solana|starknet|sui] [devnet|testnet|mainnet]

<b>EXAMPLE:</b>
k8s_switch solana mainnet
k8s_switch aptos testnet
</pre>

### pod_log

<pre>
<b>DESCRIPTION:</b>
View the logs for a given pod

<b>USAGE:</b>
pod_log [POD_NAME]

<b>EXAMPLE:</b>
pod_log permissioned-oracle-idx-1 --previous
pod_log permissioned-oracle-idx-1 -f
</pre>

### pod_restart

<pre>
<b>DESCRIPTION:</b>
Restart a specific pod(s) matching a grep pattern

<b>USAGE:</b>
pod_restart [GREP_STRING]

<b>EXAMPLE:</b>
pod_restart function-simulator
</pre>

### restart_oracles

<pre>
<b>DESCRIPTION:</b>
Restart all pods in a cluster which have an app=oracle

<b>USAGE:</b>
restart_oracles [arbitrum|aptos|aurora|coredao|near|optimism|solana|starknet|sui] [devnet|testnet|mainnet]

<b>EXAMPLE:</b>
restart_oracles solana mainnet
restart_oracles aptos testnet
</pre>

## Change Cluster

```bash
# k8s_switch [CHAIN] [CLUSTER]
k8s_switch solana devnet
# OR
gcloud container clusters get-credentials helmwave --region us-central1 --project switchboard-devnet
```

- `CHAIN` can be aptos, near, solana, or task-runner
- `NETWORK` can be mainnet, devnet, or testnet (blank if task-runner)

## List Pods

```bash
▶ kubectl get po
NAME                                                  READY   STATUS    RESTARTS   AGE
pushgateway-deployment-bbbc99d64-vhwzl                1/1     Running   0          20h
solana-permissioned-crank-idx-1-66d786b7d4-m29d8      1/1     Running   0          60m
solana-permissioned-oracle-idx-1-86cfcb864b-kng8q     1/1     Running   0          60m
solana-permissioned-oracle-idx-2-84cf5b5f9f-lz7x5     1/1     Running   0          14h
solana-permissioned-oracle-idx-3-5555dfdd86-n9kpm     1/1     Running   0          14h
# ...
```

## View Logs

### View a Single Pods Logs

```bash
pod_log solana-permissioned-crank-idx-1
```

- `-f` to stream the logs
- `--previous` to view the previous pod before it crashed

### View all Logs for a Given App

This will stream all of the logs for a pod that has a label with `app=oracle` or
`app=crank`

```bash
oracle_logs
# OR
crank_logs
```

### Find a Specific Log

```bash
pod_grep solana-permissioned-oracle-idx-2 [SEARCH_STRING]
```

## Restart a Pod

```bash
kubectl rollout restart deployment solana-permissioned-oracle-idx-1
```

Or use the `pod_restart` bash function

```bash
pod_restart function-simulator
```

## Restart all oracle pods (Faster startup but with downtime)

```bash
kubectl delete po -l app=oracle
```

## Investigate a Pod

```bash
▶ kubectl describe pod solana-permissioned-oracle-idx-1
Name:             solana-permissioned-oracle-idx-4-5dcd756db4-8mflr
Namespace:        default
Priority:         0
Service Account:  oracle-service-account
Node:             gk3-helmwave-nap-1qn4v5pv-4722f0e8-e8mr
Start Time:       Fri, 27 Jan 2023 16:38:44 -0700
Labels:           app=oracle
                  chain=solana
                  pod-template-hash=5dcd756db4
                  queue=permissioned
                  should_scrape=scrape
Annotations:      kubectl.kubernetes.io/restartedAt: 2023-01-05T10:12:25-07:00
                  seccomp.security.alpha.kubernetes.io/pod: runtime/default
Status:           Running
# ...
```
