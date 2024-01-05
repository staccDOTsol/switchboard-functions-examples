#!/bin/bash

# Check if the 'secrets-testing-db' container is already running
if [[ "$(docker ps -q -f name=secrets-testing-db)" ]]; then
    echo "The 'secrets-testing-db' container is already running."
else
    docker run -d \
      --network host \
      --name secrets-testing-db \
      -e POSTGRES_PASSWORD=examplepassword \
      -e POSTGRES_USER=exampleuser \
      -v ./init:/docker-entrypoint-initdb.d/ \
      postgres
    echo "The 'secrets-testing-db' container has started."
fi

echo "DATABASE_URL=postgresql://postgres:postgres@localhost:5432/secrets.db"