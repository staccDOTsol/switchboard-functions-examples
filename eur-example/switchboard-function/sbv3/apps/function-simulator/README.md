<div align="center">

![Switchboard Logo](https://github.com/switchboard-xyz/sbv2-core/raw/main/website/static/img/icons/switchboard/avatar.png)

# Switchboard Function Simulator

> A server run within a secure enclave to help debug Switchboard Functions.

</div>

## Environment Variables

| Variable               | Definition                                                                |
| ---------------------- | ------------------------------------------------------------------------- |
| PORT                   | The network port to use for the websocket. Defaults to `8080`             |
| SOLANA_MAINNET_RPC_URL | Solana mainnet RPC URL. Defaults to `https://api.mainnet-beta.solana.com` |
| SOLANA_DEVNET_RPC_URL  | Solana devnet RPC URL. Defaults to `https://api.devnet.solana.com`        |

## Usage

Once the server is running, start sending data like so:

```ts
import WebSocket from "ws";
import * as sb from "@switchboard-xyz/function-simulator";

async function main() {
  const ws = new WebSocket(sb.SIMULATION_SERVER_URL);

  const message: sb.MsgInEcho = {
    event: "echo",
    data: {
      message: "echo this message back to me",
    },
  };

  ws.onopen = (event) => {
    console.log(`sending echo`);
    ws.send(JSON.stringify(message));
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data.toString("utf-8"));
    console.log("received msg", msg);
    process.exit(0);
  };
}
```

### Message Types

#### `container_verify`

Verify a container can be pulled and created.

```json
{
  "event": "containerVerify",
  "data": {
    "container": "switchboardlabs/binance-oracle"
  }
}
```

#### `measurement`

Retrieve the measurement of a given image on dockerhub.

```json
{
  "event": "measurement",
  "data": {
    "containerRegistry": "dockerhub",
    "container": "switchboardlabs/binance-oracle",
    "version": "latest"
  }
}
```

#### `solana_simulate`

Simulate a Solana function with a given set of inputs and stream the container logs to the websocket client.

```json
{
  "event": "solanaSimulate",
  "data": {
    "fnKey": "YOUR_FUNCTION_PUBKEY",
    "cluster": "Devnet",
    "params": {
      // override values
      "containerRegistry": "dockerhub",
      "container": "switchboardlabs/binance-oracle",
      "version": "latest",
      "fnData": "", // hex encoded FunctionAccountData
      "fnRequestKey": "", // pubkey
      "fnRequestData": "", // hex encoded FunctionRequestAccountData
      "payer": "", // pubkey
      "verifier": "", // pubkey
      "rewardReceiver": "" // pubkey
    }
  }
}
```

## Azure Deployment

The secrets server needs to run within a secure enclave. Currently only Microsoft Azure is supported in the docs.

Install the Azure CLI. See the [Official Docs - How to install Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli).

```bash
# Ubuntu
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash

# Mac OS
brew update && brew install azure-cli
```

Login

```bash
az login
```

Run the following to create a cluster named _function-simulator_ in _uksouth_, enable the confidential compute plugin, create a static IP address and assign it to the cluster.

```bash
az group create --name Default --location uksouth

az aks create --name function-simulator \
    --resource-group Default \
    --node-vm-size Standard_DC2s_v3 \
    --generate-ssh-keys

az aks enable-addons --addons confcom --name function-simulator --resource-group Default

az network public-ip create --name function-simulator-ip --sku Standard \
  --allocation-method Static \
  --resource-group $(az aks show --resource-group Default --name function-simulator --query nodeResourceGroup -o tsv)

az aks update --name function-simulator \
    --resource-group Default \
    --load-balancer-managed-outbound-ip-count 0 \
    --load-balancer-outbound-ips $(az network public-ip show --resource-group Default --query id --output tsv)
```

### Installing networking stack

```bash
helm repo add jetstack https://charts.jetstack.io
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update

az aks get-credentials -g Default -n sb-internal

helm install \
  cert-manager jetstack/cert-manager \
  --namespace cert-manager \
  --create-namespace \
  --version v1.9.1 \
  --set installCRDs=true \
  --set global.leaderElection.namespace=cert-manager

helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx \
  --create-namespace \
  --timeout 600s \
  --debug \
  -f nginx-values.yaml
```
