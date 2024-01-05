import { OracleJob } from "@switchboard-xyz/common";

export const usdtBitstamp = Buffer.from(
  OracleJob.encodeDelimited(
    OracleJob.create({
      tasks: [
        {
          httpTask: {
            url: "https://www.bitstamp.net/api/v2/ticker/usdtusd",
          },
        },
        {
          medianTask: {
            tasks: [
              {
                jsonParseTask: {
                  path: "$.ask",
                },
              },
              {
                jsonParseTask: {
                  path: "$.bid",
                },
              },
              {
                jsonParseTask: {
                  path: "$.last",
                },
              },
            ],
          },
        },
      ],
    })
  ).finish()
);

export const usdtBittrex = Buffer.from(
  OracleJob.encodeDelimited(
    OracleJob.create({
      tasks: [
        {
          httpTask: {
            url: "https://api.bittrex.com/v3/markets/usdt-usd/ticker",
          },
        },
        {
          medianTask: {
            tasks: [
              {
                jsonParseTask: {
                  path: "$.askRate",
                },
              },
              {
                jsonParseTask: {
                  path: "$.bidRate",
                },
              },
              {
                jsonParseTask: {
                  path: "$.lastTradeRate",
                },
              },
            ],
          },
        },
      ],
    })
  ).finish()
);

export const usdtKraken = Buffer.from(
  OracleJob.encodeDelimited(
    OracleJob.create({
      tasks: [
        {
          httpTask: {
            url: "https://api.kraken.com/0/public/Ticker?pair=USDTUSD",
          },
        },
        {
          medianTask: {
            tasks: [
              {
                jsonParseTask: {
                  path: "$.result.USDTUSD.a[0]",
                },
              },
              {
                jsonParseTask: {
                  path: "$.result.USDTUSD.b[0]",
                },
              },
              {
                jsonParseTask: {
                  path: "$.result.USDTUSD.c[0]",
                },
              },
            ],
          },
        },
      ],
    })
  ).finish()
);
