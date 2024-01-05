## Useful Metrics

These metrics can provide insight on the status of your feeds, oracle and crank. they can be found at /metrics endpoint of the pod on port 9090

- switchboard_aggregator_variances
- switchboard_last_tx_unix_time
- switchboard_last_crankpop_unix_time

## Job Simulation

Navigate through the switchboard explorer to the feed of interest. near the bottom of the page, there is a line that says "Feed Jobs" with a button reading "simulate". Pressing the simulate button runs the jobs just as if it was being run on the oracle. Missing/erroneous values can be a cause of degraded feed health.

## Fund Lease

In the event that a feed is no longer updating due to an insufficient lease balance, you can easily fund the new lease by navigating to the specific page for the feed of interest, linking your wallet and pressing the "contribute" button. To ensure automatic updates after funding a depleted lease, be sure to press the button for re-enabling auto-updates

## Restart Oracles and Cranks

in order to restart the oracle or crank as fast as possible, without regard for minimal downtime, simply delete the pods and rely on the kubernetes deployment to automatically spin up new pods.

```bash
kubectl delete po -l app=oracle
```

in order to delete all crank pods, simply change "app=oracle" to "app=crank"
