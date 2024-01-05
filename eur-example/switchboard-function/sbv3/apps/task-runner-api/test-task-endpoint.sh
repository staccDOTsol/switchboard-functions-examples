#!/bin/bash
curl -X POST http://localhost:3000/task -H "Content-Type: application/json" -d \
'{
    "input": "{\"symbol\":\"BTCUSDT\",\"price\":\"28306.68000000\"}", 
    "task": {"jsonParseTask":{"path":"$.price"}}
}'