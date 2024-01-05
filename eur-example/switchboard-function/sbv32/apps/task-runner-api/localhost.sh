#!/bin/bash

set -e

printf "\nSimulate endpoint\n"
curl http://localhost:3000/simulate -X POST -H "Content-Type: application/json" -d '{
  "api_key": "not_real",
  "jobs": 
    [ 
      {
        "tasks": [
          {
            "httpTask": {
              "url": "https://api.kraken.com/0/public/Ticker?pair=BLURUSD",
              "method": "METHOD_GET"
            }
          },
          {
            "medianTask": {
              "tasks": [
                {
                  "jsonParseTask": {
                    "path": "$.result.BLURUSD.a[0]"
                  }
                },
                {
                  "jsonParseTask": {
                    "path": "$.result.BLURUSD.b[0]"
                  }
                },
                {
                  "jsonParseTask": {
                    "path": "$.result.BLURUSD.c[0]"
                  }
                }
              ]
            }
          }
        ]
      }
    ]
}'


# printf "\n\nTask endpoint\n"
# curl http://localhost:3000/task -X POST -H "Content-Type: application/json" -d '{
#   "task": { "valueTask": { "value": 1337 }}
# }'



# printf "\n\n##### ERRORS #####\nSimulate endpoint\n"
# curl http://localhost:3000/simulate -X POST -H "Content-Type: application/json" -d '{
#   "api_key": "not_real",
#   "jobs": 
#     [ 
#       { "tasks": 
#         [
#           {
#             "valueTask": {
#               "value": "1337"
#             }
#           }
#         ]
#       }
#     ]
# }'


# printf "\n\nTask endpoint\n"
# curl http://localhost:3000/task -X POST -H "Content-Type: application/json" -d '{
#   "task": { "valueTask": { "value": "1337" }}
# }'