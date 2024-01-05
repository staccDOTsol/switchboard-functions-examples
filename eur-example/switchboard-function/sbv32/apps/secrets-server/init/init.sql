CREATE DATABASE secrets;
\c secrets

CREATE TABLE secrets (
    id SERIAL PRIMARY KEY,
    mr_enclave VARCHAR(64) NOT NULL,
    name VARCHAR(64) NOT NULL,
    secret TEXT NOT NULL,
    advisories JSONB NOT NULL
);

