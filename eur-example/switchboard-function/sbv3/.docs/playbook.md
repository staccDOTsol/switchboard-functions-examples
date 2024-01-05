# What to check if feed is stale?

- ## Lease balances

  A common cause of feed outages. Simply topping up the lease via the switchboard explorer and enabling auto updates is enough to remediate.

- ## Review job simulation results

  This may also help you discover if some upstream data feeds are unhealthy (ex: stablecoin not updating due to bounds+depeg)

- ## Logs for Oracle or Crank
  checking logs with the flag --since=1m helps check to see if any logs have been emitted in the past minute. See [Troubleshooting](./troubleshooting.md) for the command on how to restart an oracle or crank
- ## Liveness Metrics
  See [Troubleshooting](./troubleshooting.md) for relevant metrics
