import { OracleJob } from "@switchboard-xyz/common";

// Make Job data for eth price
export const ethBinance = Buffer.from(
  OracleJob.encodeDelimited(
    OracleJob.create({
      tasks: [
        {
          httpTask: {
            url: "https://www.binance.us/api/v3/ticker/price?symbol=ETHUSDT",
          },
        },
        {
          jsonParseTask: {
            path: "$.price",
          },
        },
      ],
    })
  ).finish()
);

export const ethKraken = Buffer.from(
  OracleJob.encodeDelimited(
    OracleJob.create({
      tasks: [
        {
          httpTask: {
            url: "https://api.kraken.com/0/public/Ticker?pair=XETHZUSDT",
          },
        },
        {
          medianTask: {
            tasks: [
              {
                jsonParseTask: {
                  path: "$.result.XETHZUSD.a[0]",
                },
              },
              {
                jsonParseTask: {
                  path: "$.result.XETHZUSD.b[0]",
                },
              },
              {
                jsonParseTask: {
                  path: "$.result.XETHZUSD.c[0]",
                },
              },
            ],
          },
        },
      ],
    })
  ).finish()
);

export const ethBitfinex = Buffer.from(
  OracleJob.encodeDelimited(
    OracleJob.create({
      tasks: [
        {
          httpTask: {
            url: "https://api-pub.bitfinex.com/v2/tickers?symbols=tETHUSD",
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
