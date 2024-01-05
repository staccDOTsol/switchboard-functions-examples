curl -X POST "https://functions.switchboard.xyz/mrenclave" \
    -H "Content-Type: application/json" \
    -d \
    '{
         "container": "gallynaut/basic-oracle-function",
         "version": "latest"
    }'