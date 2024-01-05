import { OracleJob } from "@switchboard-xyz/common";

// Make Job data for near price
export const nearBinance = Buffer.from(
  OracleJob.encodeDelimited(
    OracleJob.create({
      tasks: [
        {
          httpTask: {
            url: "https://www.binance.us/api/v3/ticker/price?symbol=NEARUSD",
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

export const nearBitfinex = Buffer.from(
  OracleJob.encodeDelimited(
    OracleJob.create({
      tasks: [
        {
          httpTask: {
            url: "https://api-pub.bitfinex.com/v2/tickers?symbols=tNEARUSD",
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
