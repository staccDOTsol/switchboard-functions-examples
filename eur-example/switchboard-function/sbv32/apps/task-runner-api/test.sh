#!/bin/bash

set -e

trap "trap - SIGTERM && kill -- -$$" SIGINT SIGTERM EXIT

pnpm install

echo "Starting server on port 3030"

PORT="3030" pnpm start &

echo "Waiting 5s for server to start ..."

sleep 5

echo "Fetching request ..."

response=$(curl --silent -X POST http://localhost:3030/simulate -H "Content-Type: application/json" -d '{
  "jobs": 
    [ 
      { "tasks": 
        [
          {
            "valueTask": {
              "value": 1337
            }
          }
        ]
      }
    ]
}')

if [[ "$response" == *"error"* ]]; then
  error=$(echo "$response" | jq -r '.error')
  echo "Error: $error"
  pkill -P $$
  exit 1
else
  result=$(echo "$response" | jq -r '.result')
  printf "Result: %s" "$result"
  echo ""
  pkill -P $$
  exit 0
fi
