# Building

sudo docker build . -t switchboardlabs/alerting-server

# Deploying

gcloud container clusters get-credentials internal-apps --region us-central1 --project switchboard-indexers

kubectl apply -f ./k8s/

# Example Queries

https://alerting.switchboard.xyz/solana/mainnet-beta/check/staleness/?minTillStale=90&address=BnT7954eT3UT4XX5zf9Zwfdrag5h3YmzG8LBRwmXo5Bi
https://alerting.switchboard.xyz/aptos/mainnet/check/staleness/?minTillStale=90&address=0xdc1045b4d9fd1f4221fc2f91b2090d88483ba9745f29cf2d96574611204659a5&targetPrice=1&varianceThreshold=0.005
