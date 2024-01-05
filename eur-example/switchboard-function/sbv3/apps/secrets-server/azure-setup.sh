#!/bin/bash

set -e

if [ -x "$(command -v az)" ]; then
    return 0;
fi

clusterName=sb-internal
resourceGroup=Default
configFile=helm-values.yaml
publicIpName=internal-secrets-server-ip

# Query AKS to see if a cluster with the given name exists in the given resource group
if ! az aks show --name "${clusterName}" --resource-group "${resourceGroup}" --query "name" --output tsv 2>/dev/null; then
    echo "Target cluster ${clusterName} not found in resource group ${resourceGroup}";
    exit 1
fi

# Get the credentials for the cluster
az aks get-credentials --resource-group "${resourceGroup}" --name "${clusterName}"

nodeResourceGroup=$(az aks show --resource-group "${resourceGroup}" --name "${clusterName}" --query nodeResourceGroup -o tsv)
echo "Node Resource Group: ${nodeResourceGroup}"

publicIpAddress=""

# Verify the public IP does not exist already
publicIpAddress=$(az network public-ip show --name "${publicIpName}" --resource-group "${nodeResourceGroup}" --query 'ipAddress' --output tsv 2>/dev/null) || true
if [[ "${publicIpAddress}" != "" ]]; then
    echo "Public IP exists with IP Address: ${publicIpAddress}"
else
    echo "Public IP does not exist, creating it ..."
    az network public-ip create --resource-group "${resourceGroup}" --name "${publicIpName}" --sku Standard --allocation-method Static
    publicIpId=$(az network public-ip show --resource-group "${resourceGroup}" --name "${publicIpName}" --query id --output tsv)
    echo "Public IP ID: ${publicIpId}"
    publicIpAddress=$(az network public-ip show --resource-group "${resourceGroup}" --name "${publicIpName}" --query ipAddress --output tsv)
    echo "Public IP Address: ${publicIpAddress}"

    # Update the AKS cluster to use the public IP address
    az aks update --resource-group "${resourceGroup}" --name "${clusterName}" --load-balancer-managed-outbound-ip-count 0 --load-balancer-outbound-ips "${publicIpId}"

    clientId=$(az aks show --name "${clusterName}" --resource-group "${resourceGroup}" --query identity.principalId -o tsv)
    echo "Client ID: ${clientId}"

    rgScope=$(az group show --name "${resourceGroup}" --query id -o tsv)
    echo "RG Scope: ${rgScope}"

    az role assignment create --assignee "${clientId}" --role "Network Contributor" --scope "${rgScope}"
fi

if [[ "${publicIpAddress}" == "" ]]; then
    echo "Failed to get the public IP address"
    exit 1
fi

sed -iE "s;publicIP.*$;publicIP: ${publicIpAddress};" "${configFile}"