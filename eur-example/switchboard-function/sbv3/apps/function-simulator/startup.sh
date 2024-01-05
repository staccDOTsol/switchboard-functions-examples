#!/bin/bash

set -eo pipefail
stty sane

source "$(dirname "${BASH_SOURCE[0]}")/../../scripts/utils/azure_utils.sh"
source "$(dirname "${BASH_SOURCE[0]}")/../../scripts/utils/ssh_utils.sh"

CLUSTER_NAME="function-simulator"
CLUSTER_LOCATION="uksouth"
RESOURCE_GROUP="Default"
VM_SIZE=Standard_DC2s_v3
while getopts 'c:l:g:s:' OPTION; do
  case "$OPTION" in
    c)
      CLUSTER_NAME="$OPTARG"
      ;;
    l)
      CLUSTER_LOCATION="$OPTARG"
      ;;
    g)
      RESOURCE_GROUP="$OPTARG"
      ;;
    s)
      VM_SIZE="$OPTARG"
      ;;
    ?)
      display_help
      exit 1
      ;;
  esac
done
shift "$(($OPTIND -1))"

echo -e "CLUSTER_NAME: ${Blue}$CLUSTER_NAME${Color_Off}"
echo -e "CLUSTER_LOCATION: ${Blue}$CLUSTER_LOCATION${Color_Off}"
echo -e "RESOURCE_GROUP: ${Blue}$RESOURCE_GROUP${Color_Off}"
echo -e "VM_SIZE: ${Blue}$VM_SIZE${Color_Off}"

function get_nodeResourceGroup() {
    local clusterName=$1
    if [ -z "$clusterName" ]; then
        echo -e "${Red}CLUSTER_NAME was not provided${Color_Off}"
        return 1
    fi

    local resourceGroup=$2
    if [ -z "$resourceGroup" ]; then
        echo -e "${Red}RESOURCE_GROUP was not provided${Color_Off}"
        return 1
    fi

    az aks show -g "$resourceGroup" --name "$clusterName" --query nodeResourceGroup -o tsv
}


if ! az aks list -g "$RESOURCE_GROUP" | jq '.[].name' | grep "$CLUSTER_NAME" > /dev/null; then
  echo "Cluster does not exist. Creating ...";

  # Create the resource group if it doesnt exist
  if [ "$(az group exists --name $RESOURCE_GROUP)" == "false" ]; then
    az group create --name "$RESOURCE_GROUP" --location "$CLUSTER_LOCATION"
  fi

  # # Create the public IP
  # az network public-ip create -g "$RESOURCE_GROUP" --name "$CLUSTER_NAME"-ip --sku Standard --allocation-method static

  # # Get the static IP resource ID
  # staticIpResourceId=$(az network public-ip show -g "$RESOURCE_GROUP" --name "$CLUSTER_NAME"-ip --query id --output tsv)
  # echo -e "Static IP Resource ID: ${Blue}$staticIpResourceId${Color_Off}"

  # # Get the static IP address
  # staticIpAddress=$(az network public-ip show -g "$RESOURCE_GROUP" --name "$CLUSTER_NAME"-ip --query ipAddress --output tsv)
  # echo -e "Static IP Address: ${Blue}$staticIpAddress${Color_Off}"

  # Create the cluster
  az aks create -g "$RESOURCE_GROUP" --name "$CLUSTER_NAME" \
    --node-vm-size "$VM_SIZE" \
    --enable-managed-identity \
    --enable-addons "confcom" \
    --generate-ssh-keys

  # Get node resource group
  nodeResourceGroup=$(get_nodeResourceGroup "$CLUSTER_NAME" "$RESOURCE_GROUP")
  echo -e "Node Resource Group: ${Blue}$nodeResourceGroup${Color_Off}"

  # Create static public IP for the ingress
  staticIpAddress=$(az network public-ip create --resource-group "$nodeResourceGroup" --name "$CLUSTER_NAME"-ip --sku Standard --allocation-method static --query publicIp.ipAddress -o tsv)
  echo -e "Static IP Address: ${Blue}$staticIpAddress${Color_Off}"

  # Get the static IP resource ID
  staticIpResourceId=$(az network public-ip show -g "$nodeResourceGroup" --name "$CLUSTER_NAME"-ip --query id --output tsv)
  echo -e "Static IP Resource ID: ${Blue}$staticIpResourceId${Color_Off}"

  # Add to AKS cluster ?? NO? - we want this IP for the function-simulator-service only, not the cluster
  # az aks update -g "$RESOURCE_GROUP" --name "$CLUSTER_NAME" --load-balancer-managed-outbound-ip-count 1 --load-balancer-outbound-ips "$staticIpResourceId"

  az aks update -g Default --name sb-internal --load-balancer-managed-outbound-ip-count 0 --load-balancer-outbound-ips  /subscriptions/96ffc840-775d-4019-9872-14559f8d156b/resourceGroups/MC_Default_sb-internal_uksouth/providers/Microsoft.Network/publicIPAddresses/sb-internal-ip
else
    echo "Cluster exists already. Connecting ...";
fi

# Get node resource group
nodeResourceGroup=$(get_nodeResourceGroup "$CLUSTER_NAME" "$RESOURCE_GROUP")
echo -e "Node Resource Group: ${Blue}$nodeResourceGroup${Color_Off}"

# Get the static IP resource ID
staticIpResourceId=$(az network public-ip show -g "$nodeResourceGroup" --name "$CLUSTER_NAME"-ip --query id --output tsv)
echo -e "Static IP Resource ID: ${Blue}$staticIpResourceId${Color_Off}"

# Get the static IP address
staticIpAddress=$(az network public-ip show -g "$nodeResourceGroup" --name "$CLUSTER_NAME"-ip --query ipAddress --output tsv)
echo -e "Static IP Address: ${Blue}$staticIpAddress${Color_Off}"

CLIENT_ID=$(az aks show -g "$RESOURCE_GROUP" --name "$CLUSTER_NAME" --query identity.principalId -o tsv)
echo -e "Client ID: ${Blue}$CLIENT_ID${Color_Off}"

RG_SCOPE=$(az group show --name "$RESOURCE_GROUP" --query id -o tsv)
echo -e "Resource Group Scope: ${Blue}$RG_SCOPE${Color_Off}"

ROLE="Network Contributor"
if [ "$(az role assignment list --assignee "$CLIENT_ID" --role "$ROLE" --scope "$RG_SCOPE" --query "[?roleDefinitionName=='$ROLE'].roleDefinitionName" -o tsv)" != "$ROLE" ]; then
  az role assignment create --assignee "$CLIENT_ID" --role "$ROLE" --scope "$RG_SCOPE"
  echo -e "Resource Role: ${Blue}$ROLE${Color_Off}"
fi

# Connect to the cluster
az aks get-credentials -g "$RESOURCE_GROUP" --name "$CLUSTER_NAME"
echo -e "${Green}Function simulation server initialized!${Color_Off}"


# 

# az aks show -g myNetworkResourceGroup --name sb-azure-internal --query nodeResourceGroup -o tsv
# # MC_myNetworkResourceGroup_sb-azure-internal_uksouth

# az network public-ip create -g MC_myNetworkResourceGroup_sb-azure-internal_uksouth --name sb-internal-ingress-public-ip --sku Standard --allocation-method static --query publicIp.ipAddress -o tsv
# # 20.108.172.52

# helm install ingress-nginx ingress-nginx/ingress-nginx \
#     --namespace ingress-basic \
#     --set controller.replicaCount=2 \
#     --set controller.nodeSelector."beta\.kubernetes\.io/os"=linux \
#     --set defaultBackend.nodeSelector."beta\.kubernetes\.io/os"=linux \
#     --set controller.service.externalTrafficPolicy=Local \
    
#     --set controller.service.loadBalancerIP="20.108.172.52"

# kubectl get service -l app.kubernetes.io/name=ingress-nginx --namespace ingress-basic