# Building

tsc --outDir build

# Deploying

gcloud functions deploy pager-function \
--gen2 \
--runtime=nodejs18 \
--region=us-central1 \
--project=switchboard-indexers \
--source=. \
--entry-point=checkChain \
--trigger-http \
--allow-unauthenticated

# Example Queries

https://us-central1-switchboard-indexers.cloudfunctions.net/pager-function/near/testnet/check/staleness?address=21EKutL6JAudcS2MVvfgvCsKqxLNovy72rqpwo4gwzfR&minTillStale=5
https://us-central1-switchboard-indexers.cloudfunctions.net/pager-function/solana/mainnet-beta/check/staleness/?minTillStale=90&address=BnT7954eT3UT4XX5zf9Zwfdrag5h3YmzG8LBRwmXo5Bi
https://us-central1-switchboard-indexers.cloudfunctions.net/pager-function/aptos/mainnet/check/staleness/?minTillStale=90&address=0xdc1045b4d9fd1f4221fc2f91b2090d88483ba9745f29cf2d96574611204659a5&targetPrice=1&varianceThreshold=0.005
