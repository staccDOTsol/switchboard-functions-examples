# Switchboard.xyz Function on Solana Blockchain


## Objective

This switchboard function is responsible for aggregating the EUR_USD exchange rate
to a switchboard feed via switchboard function.

In the below steps we will go over deploying a function and adding a schedule in
place to manage switchboard feed updates.

## CLI Commands

On devnet, your QUEUE_ADDRESS is CkvizjVnm2zA5Wuwan34NhVT3zFc7vqUyGnA6tuEF5aE

```export QUEUE_ADDRESS=CkvizjVnm2zA5Wuwan34NhVT3zFc7vqUyGnA6tuEF5aE```

or on mainnet-beta:

```export QUEUE_ADDRESS=2ie3JZfKcvsRLsJaP5fSo43gUo1vsurnUAtAgUdUAiDG```

to build your docker image and push it to your dockerhub, first modify .env to match your docker username then

```make build && make publish```

now run the following to get your Enclave Measurement (MrEnclve):

```make measurement```

export the result:

```export MSR={0x...}```

and your cluster:

```export CLUSTER=devnet```

To create the function you can run ts-node scripts/init-basic-oracle.ts or optionall run the below CLI command:

```sb solana function create ${QUEUE_ADDRESS?} --container ${DOCKER_IMAGE_NAME} --containerRegistry dockerhub --keypair ~/.config/solana/id.json --cluster ${CLUSTER?} --mrEnclave ${MSR?}```

Next, to create a trigger on a regular schedule you can run something akin to - in this case we can omit `--params`

```sb solana routine create $FUNCTION_ID --schedule "*/10 * * * * *" --keypair ~/.config/solana/id.json --network $CLUSTER ```

And then fund it:

```sb solana routine fund $ROUTINE_ID --keypair ~/.config/solana/id.json --network $CLUSTER --fundAmount 0.02```

And we can test it in production like so:

```sb solana function test```

And we can simulate before deploying via:

```sb solana function test --devnetSimulate```
