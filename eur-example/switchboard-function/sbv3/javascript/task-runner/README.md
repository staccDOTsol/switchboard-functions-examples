# Task Runner

## Install

```bash
yarn install
yarn build
```

## ctx

### cache

stores items in a temporary cache to share with future job executions

- Anchor IDL's for fetching on-chain accountInfo
- Websockets
- Websocket responses
- Websocket subscriptionss

### clients

clients with helper functions for various protocols

- switchboard
- serum
- saber
- raydium
- pyth
- port
- orca
- mercurial
- mango
- jupiter
- chainlink

### logger

logger to be used

### task

task runner for the `OracleJob` interface

```typescript
const ctx = new JobContext(
  taskRunner,
  "",
  OracleJob.fromObject({}),
  undefined,
  input ?? ""
);
const result: ITaskResult = await ctx.task.run(ctx, {
  valueTask: {
    scalar,
  },
});
```

### worker

workerpool to off-load CPU related tasks

- can be disabled with `DISABLE_WORKERPOOL`
- can disable websocket workers with `DISABLE_WORKERPOOL_WEBSOCKET`
- can disable jsonpath worker with `DISABLE_WORKERPOOL_JSONPATH`
- can disable twap worker with `DISABLE_WORKERPOOL_TWAP`

## TaskRunnerReceipt

Returns a receipt of the TaskRunner execution containing the job ID, OracleJob,
and an array of TaskResult's for each top level task.

```typescript
const receipt = await taskRunner.perform(PublicKey.default.toString(), job);
if ("error" in receipt) {
  throw new Error(`Job failed with error ${receipt.error}`);
}
console.log(receipt.result);
```
