# Azure Devops

Install the Azure CLI

```bash
brew update
brew install azure-cli
```

Login

```bash
az login
```

Set the cluster

```bash

az aks get-credentials -n functions-devnet -g default
```

View logs like you normally would with kubectl

```bash
kubectl logs -f -l app=oracle --all-containers --max-log-requests=100 --prefix=true
```
