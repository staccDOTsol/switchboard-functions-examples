import { OracleJob } from "@switchboard-xyz/common";

// Make Job data for sol price

export const solMexc = Buffer.from(
  OracleJob.encodeDelimited(
    OracleJob.fromYaml(`
      tasks:
        - httpTask:
            url: https://www.mexc.com/open/api/v2/market/ticker?symbol=SOL_USDT
        - medianTask:
            tasks:
              - jsonParseTask:
                  path: $.data[0].ask
              - jsonParseTask:
                  path: $.data[0].bid
              - jsonParseTask:
                  path: $.data[0].last
        - multiplyTask:
            aggregatorPubkey: ETAaeeuQBwsh9mC2gCov9WdhJENZuffRMXY2HgjCcSL9
    `)
  ).finish()
);

export const solHuobi = Buffer.from(
  OracleJob.encodeDelimited(
    OracleJob.fromYaml(`
      tasks:
        - httpTask:
            url: https://api.huobi.pro/market/detail/merged?symbol=solusdt
        - medianTask:
            tasks:
              - jsonParseTask:
                  path: $.tick.bid[0]
              - jsonParseTask:
                  path: $.tick.ask[0]
        - multiplyTask:
            aggregatorPubkey: ETAaeeuQBwsh9mC2gCov9WdhJENZuffRMXY2HgjCcSL9
    `)
  ).finish()
);

export const solKraken = Buffer.from(
  OracleJob.encodeDelimited(
    OracleJob.fromYaml(`
      tasks:
        - httpTask:
            url: https://api.kraken.com/0/public/Ticker?pair=SOLUSDT
        - medianTask:
            tasks:
              - jsonParseTask:
                  path: $.result.SOLUSDT.a[0]
              - jsonParseTask:
                  path: $.result.SOLUSDT.b[0]
              - jsonParseTask:
                  path: $.result.SOLUSDT.c[0]
    `)
  ).finish()
);

export const solCoinbase = Buffer.from(
  OracleJob.encodeDelimited(
    OracleJob.fromYaml(`
      tasks:
        - httpTask:
            url: https://api.coinbase.com/v2/prices/SOL-USD/spot
        - jsonParseTask:
            path: $.data.amount
    `)
  ).finish()
);

export const solBitfinex = Buffer.from(
  OracleJob.encodeDelimited(
    OracleJob.create({
      tasks: [
        {
          httpTask: {
            url: "https://api-pub.bitfinex.com/v2/tickers?symbols=tSOLUSD",
          },
        },
        {
          medianTask: {
            tasks: [
              {
                jsonParseTask: {
                  path: "$[0][1]",
                },
              },
              {
                jsonParseTask: {
                  path: "$[0][3]",
                },
              },
              {
                jsonParseTask: {
                  path: "$[0][7]",
                },
              },
            ],
          },
        },
      ],
    })
  ).finish()
);
