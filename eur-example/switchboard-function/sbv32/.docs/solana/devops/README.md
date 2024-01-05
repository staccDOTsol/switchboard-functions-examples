# Solana

| Network                | Pubkeys                                                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Mainnet Permissioned   | Queue: `3HBb2DQqDfuMdzWxNk1Eo9RTMkFYmuEAd32RiLKn9pAn` <br />Crank: `GdNVLWzcE6h9SPuSbmu69YzxAj8enim9t6mjzuqTXgLd` |
| Mainnet Permissionless | Queue: `5JYwqvKkqp35w8Nq3ba4z1WYUeJQ1rB36V8XvaGp6zn1` <br />Crank: `BKtF8yyQsj3Ft6jb2nkfpEKzARZVdGgdEPs6mFmZNmbA` |
| Devnet Permissioned    | Queue: `GhYg3R1V6DmJbwuc57qZeoYG6gUuvCotUF1zU3WCj98U` <br />Crank: `85L2cFUvXaeGQ4HrzP8RJEVCL7WvRrXM2msvEmQ82AVr` |
| Devnet Permissionless  | Queue: `F8ce7MsckeZAbAGmxjJNetxYXQa9mKr9nnrC3qKubyYy` <br />Crank: `GN9jjCy2THzZxhYqZETmPM3my8vg4R5JyNkgULddUMa5` |

## Network Health

You can use the following commands to get an overall picture of the network. Add
`--mainnetBeta` to switch networks.

### Feed Health

This command requires a feed to have a history buffer enabled. It gives an
overall picture of how often a feed is scheduled to update vs its actual update
time.

```bash
▶ sbv2 solana aggregator metrics GvDMxPzN1sCj7L26YDK2HnMRXEQmQ2aemov8YBtPS7vR --period 3600
period                  3595 seconds
numSamples              396 updates
updateInterval          6 seconds
maxUpdateIntervalWithJitter9 seconds
avgUpdateDelay          9.0783 seconds
avgUpdateCoefficient    1.5131
averageValue            24.153623388617426
standardDeviation       0.07297735717533625
start                   [1674836551, 24.0866025]
end                     [1674840146, 24.29965]
min                     [1674837596, 24.05670125]
max                     [1674839784, 24.345775]
```

### Crank Health

This command gives the current staleness of the crank based on the Solana
timestamp.

```bash
▶ sbv2 solana crank print GN9jjCy2THzZxhYqZETmPM3my8vg4R5JyNkgULddUMa5
## Crank                GN9jjCy2THzZxhYqZETmPM3my8vg4R5JyNkgULddUMa5
name                    npc1s1
metadata                npc1s1
queue                   F8ce7MsckeZAbAGmxjJNetxYXQa9mKr9nnrC3qKubyYy
dataBuffer              9Q1Qz4CvN77mXvamg8uVpqJNC153nJs8AHu9tEougRd7
size                     105 / 1000
solanaTime              1674840353 (1 sec behind)
staleness               1
```
