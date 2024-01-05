#!/bin/bash

rm -rf ecvrf-wasm/dist
wasm-pack build --target nodejs --out-dir dist --scope switchboard-xyz ecvrf-wasm 

# sed -i '' 's/"name": "ecvrf-wasm",/"name": "@switchboard-xyz\/ecvrf-wasm",/' ecvrf-wasm/dist/package.json
