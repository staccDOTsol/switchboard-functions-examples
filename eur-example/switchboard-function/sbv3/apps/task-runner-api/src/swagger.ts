import type { OAS3Options } from "swagger-jsdoc";
import swaggerJsdoc from "swagger-jsdoc";

const options: OAS3Options = {
  failOnErrors: true, // Whether or not to throw when parsing errors. Defaults to false.
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Switchboard Task Runner API",
      version: "1.0.0",
      contact: {
        name: "Switchboard Support",
        url: "https://switchboard.xyz/contact",
      },
    },
    externalDocs: {
      description: "Check out the Switchboard docs",
      url: "https://docs.switchboard.xyz",
    },
    servers: [
      {
        url: "https://task.switchboard.xyz",
        description: "Production Server",
      },
      {
        url: `http://localhost:${process.env.PORT ?? "3000"}`,
        description: "Development server",
        variables: {
          port: {
            description: "The network port",
            default: "3000",
          },
        },
      },
    ],
    tags: [{ name: "switchboard", description: "Switchboard API" }],
    components: {
      schemas: {
        // ITask: {
        //   type: "object",
        //   minProperties: 1,
        //   maxProperties: 1,
        //   // oneOf: [
        //   //   "addTask",
        //   //   "anchorFetchTask",
        //   //   "boundTask",
        //   //   "bufferLayoutParseTask",
        //   //   "cacheTask",
        //   //   "comparisonTask",
        //   //   "conditionalTask",
        //   //   "cronParseTask",
        //   //   "defiKingdomsTask",
        //   //   "divideTask",
        //   //   "ewmaTask",
        //   //   "historyFunctionTask",
        //   //   "httpTask",
        //   //   "jsonParseTask",
        //   //   "jupiterSwapTask",
        //   //   "lendingRateTask",
        //   //   "lpExchangeRateTask",
        //   //   "lpTokenPriceTask",
        //   //   "mangoPerpMarketTask",
        //   //   "marinadeStateTask",
        //   //   "maxTask",
        //   //   "meanTask",
        //   //   "medianTask",
        //   //   "minTask",
        //   //   "multiplyTask",
        //   //   "oracleTask",
        //   //   "pancakeswapExchangeRateTask",
        //   //   "perpMarketTask",
        //   //   "powTask",
        //   //   "regexExtractTask",
        //   //   "roundTask",
        //   //   "serumSwapTask",
        //   //   "solanaAccountDataFetchTask",
        //   //   "splStakePoolTask",
        //   //   "splTokenParseTask",
        //   //   "subtractTask",
        //   //   "sushiswapExchangeRateTask",
        //   //   "sysclockOffsetTask",
        //   //   "tpsTask",
        //   //   "twapTask",
        //   //   "uniswapExchangeRateTask",
        //   //   "valueTask",
        //   //   "vwapTask",
        //   //   "websocketTask",
        //   //   "xstepPriceTask",
        //   // ],
        //   properties: {
        //     addTask: { $ref: "#/components/schemas/AddTask" },
        //     anchorFetchTask: { $ref: "#/components/schemas/AnchorFetchTask" },
        //     boundTask: { $ref: "#/components/schemas/BoundTask" },
        //     bufferLayoutParseTask: {
        //       $ref: "#/components/schemas/BufferLayoutParseTask",
        //     },
        //     cacheTask: { $ref: "#/components/schemas/CacheTask" },
        //     comparisonTask: { $ref: "#/components/schemas/ComparisonTask" },
        //     conditionalTask: { $ref: "#/components/schemas/ConditionalTask" },
        //     cronParseTask: { $ref: "#/components/schemas/CronParseTask" },
        //     // defiKingdomsTask: {
        //     //   $ref: "#/components/schemas/DefiKingdomsTask",
        //     // },
        //     divideTask: { $ref: "#/components/schemas/DivideTask" },
        //     ewmaTask: { $ref: "#/components/schemas/EwmaTask" },
        //     historyFunctionTask: {
        //       $ref: "#/components/schemas/HistoryFunctionTask",
        //     },
        //     httpTask: { $ref: "#/components/schemas/HttpTask" },
        //     jsonParseTask: { $ref: "#/components/schemas/JsonParseTask" },
        //     jupiterSwapTask: { $ref: "#/components/schemas/JupiterSwapTask" },
        //     lendingRateTask: { $ref: "#/components/schemas/LendingRateTask" },
        //     lpExchangeRateTask: {
        //       $ref: "#/components/schemas/LpExchangeRateTask",
        //     },
        //     lpTokenPriceTask: {
        //       $ref: "#/components/schemas/LpTokenPriceTask",
        //     },
        //     mangoPerpMarketTask: {
        //       $ref: "#/components/schemas/MangoPerpMarketTask",
        //     },
        //     marinadeStateTask: {
        //       $ref: "#/components/schemas/MarinadeStateTask",
        //     },
        //     maxTask: { $ref: "#/components/schemas/MaxTask" },
        //     meanTask: { $ref: "#/components/schemas/MeanTask" },
        //     medianTask: { $ref: "#/components/schemas/MedianTask" },
        //     minTask: { $ref: "#/components/schemas/MinTask" },
        //     multiplyTask: { $ref: "#/components/schemas/MultiplyTask" },
        //     oracleTask: { $ref: "#/components/schemas/OracleTask" },
        //     pancakeswapExchangeRateTask: {
        //       $ref: "#/components/schemas/PancakeswapExchangeRateTask",
        //     },
        //     perpMarketTask: { $ref: "#/components/schemas/PerpMarketTask" },
        //     powTask: { $ref: "#/components/schemas/PowTask" },
        //     regexExtractTask: {
        //       $ref: "#/components/schemas/RegexExtractTask",
        //     },
        //     roundTask: { $ref: "#/components/schemas/RoundTask" },
        //     serumSwapTask: { $ref: "#/components/schemas/SerumSwapTask" },
        //     solanaAccountDataFetchTask: {
        //       $ref: "#/components/schemas/SolanaAccountDataFetchTask",
        //     },
        //     splStakePoolTask: {
        //       $ref: "#/components/schemas/SplStakePoolTask",
        //     },
        //     splTokenParseTask: {
        //       $ref: "#/components/schemas/SplTokenParseTask",
        //     },
        //     subtractTask: { $ref: "#/components/schemas/SubtractTask" },
        //     sushiswapExchangeRateTask: {
        //       $ref: "#/components/schemas/SushiswapExchangeRateTask",
        //     },
        //     sysclockOffsetTask: {
        //       $ref: "#/components/schemas/SysclockOffsetTask",
        //     },
        //     tpsTask: { $ref: "#/components/schemas/TpsTask" },
        //     twapTask: { $ref: "#/components/schemas/TwapTask" },
        //     uniswapExchangeRateTask: {
        //       $ref: "#/components/schemas/UniswapExchangeRateTask",
        //     },
        //     valueTask: { $ref: "#/components/schemas/ValueTask" },
        //     vwapTask: { $ref: "#/components/schemas/VwapTask" },
        //     websocketTask: { $ref: "#/components/schemas/WebsocketTask" },
        //     xstepPriceTask: { $ref: "#/components/schemas/XstepPriceTask" },
        //   },
        // },
        AnchorFetchTask: {
          type: "object",
          required: ["accountAddress"],
          properties: {
            programId: { type: "string" },
            accountAddress: { type: "string" },
          },
        },
        BoundTask: {
          type: "object",
          minProperties: 1,
          properties: {
            lowerBound: { $ref: "#/components/schemas/OracleJob" },
            lowerBoundValue: { type: "string" },
            upperBound: { $ref: "#/components/schemas/OracleJob" },
            upperBoundValue: { type: "string" },
            onExceedsUpperBound: { $ref: "#/components/schemas/OracleJob" },
            onExceedsUpperBoundValue: { type: "string" },
            onExceedsLowerBound: { $ref: "#/components/schemas/OracleJob" },
            onExceedsLowerBoundValue: { type: "string" },
          },
        },
        BufferLayoutParseTask: {
          type: "object",
          required: ["offset", "type"],
          properties: {
            offset: { type: "number" },
            endian: { type: "string", enum: ["LITTLE_ENDIAN", "BIG_ENDIAN"] },
            type: {
              type: "string",
              enum: [
                "pubkey",
                "bool",
                "u8",
                "i8",
                "u16",
                "i16",
                "u32",
                "i32",
                "f32",
                "u64",
                "i64",
                "f64",
                "u128",
                "i128",
              ],
            },
          },
        },
        ConditionalTask: {
          type: "object",
          minProperties: 1,
          properties: {
            attempt: {
              type: "array",
              items: { $ref: "#/components/schemas/ITask" },
            },
            onFailure: {
              type: "array",
              items: { $ref: "#/components/schemas/ITask" },
            },
          },
        },
        CronParseTask: {
          type: "object",
          required: ["cronPattern"],
          properties: {
            cronPattern: {
              type: "string",
            },
            clockOffset: { type: "number" },
            clock: {
              type: "string",
              enum: ["ORACLE", "SYSCLOCK"],
              default: "ORACLE",
            },
          },
          example: {
            /* Every friday at 5 PM */
            cronPattern: "0 18 * * 3",
            /* Offset by 2hrs, reset at 7PM */
            clockOffset: 7200,
            /* Node Clock */
            clock: 0,
          },
        },
        // DefiKingdomsTask: {
        //   type: "object",
        //   required: ["provider", "inToken", "outToken"],
        //   properties: {
        //     provider: { type: "string" },
        //     inToken: { $ref: "#/components/schemas/DefiKingdomsToken" },
        //     outToken: { $ref: "#/components/schemas/DefiKingdomsToken" },
        //   },
        //   example: {
        //     provider: "https://api.harmony.one",
        //     inToken: {
        //       address: "0x72cb10c6bfa5624dd07ef608027e366bd690048f",
        //       decimals: 18,
        //     },
        //     outToken: {
        //       address: "0x985458E523dB3d53125813eD68c274899e9DfAb4",
        //       decimals: 6,
        //     },
        //   },
        // },
        DivideTask: {
          type: "object",
          minProperties: 1,
          maxProperties: 1,
          properties: {
            scalar: { type: "number" },
            aggregatorPubkey: { type: "string" },
            job: { $ref: "#/components/schemas/OracleJob" },
            big: { type: "string" },
          },
        },
        EwmaTask: { type: "object" },
        HistoryFunctionTask: { type: "object" },
        LendingRateTask: { type: "object" },
        LpExchangeRateTask: {
          type: "object",
          minProperties: 1,
          properties: {
            inTokenAddress: { type: "string" },
            outTokenAddress: { type: "string" },
            // pool address
            mercurialPoolAddress: { type: "string" },
            saberPoolAddress: { type: "string" },
            orcaPoolAddress: { type: "string" },
            raydiumPoolAddress: { type: "string" },
            portReserveAddress: { type: "string" },
          },
        },
        LpTokenPriceTask: {
          type: "object",
          minProperties: 1,
          properties: {
            // pool address
            mercurialPoolAddress: { type: "string" },
            saberPoolAddress: { type: "string" },
            orcaPoolAddress: { type: "string" },
            raydiumPoolAddress: { type: "string" },
            // other
            priceFeedAddresses: { type: "array", items: { type: "string" } },
            priceFeedJobs: {
              type: "array",
              items: { $ref: "#/components/schemas/OracleJob" },
            },
            useFairPrice: { type: "boolean" },
          },
        },
        MangoPerpMarketTask: { type: "object" },
        MarinadeStateTask: { type: "object" },
        MaxTask: {
          type: "object",
          minProperties: 1,
          properties: {
            tasks: {
              type: "array",
              items: { $ref: "#/components/schemas/ITask" },
            },
            jobs: {
              type: "array",
              items: { $ref: "#/components/schemas/OracleJob" },
            },
          },
        },
        MeanTask: {
          type: "object",
          minProperties: 1,
          properties: {
            tasks: {
              type: "array",
              items: { $ref: "#/components/schemas/ITask" },
            },
            jobs: {
              type: "array",
              items: { $ref: "#/components/schemas/OracleJob" },
            },
          },
        },
        MedianTask: {
          type: "object",
          minProperties: 1,
          properties: {
            tasks: {
              type: "array",
              items: { $ref: "#/components/schemas/ITask" },
            },
            jobs: {
              type: "array",
              items: { $ref: "#/components/schemas/OracleJob" },
            },
            minSuccessfulRequired: { type: "number" },
          },
          example: {
            tasks: [
              { jsonParseTask: { path: "$.ask" } },
              { jsonParseTask: { path: "$.bid" } },
              { jsonParseTask: { path: "$.last" } },
            ],
          },
        },
        MinTask: {
          type: "object",
          minProperties: 1,
          properties: {
            tasks: {
              type: "array",
              items: { $ref: "#/components/schemas/ITask" },
            },
            jobs: {
              type: "array",
              items: { $ref: "#/components/schemas/OracleJob" },
            },
          },
        },
        MultiplyTask: {
          type: "object",
          minProperties: 1,
          maxProperties: 1,
          properties: {
            scalar: { type: "number" },
            aggregatorPubkey: { type: "string" },
            job: { $ref: "#/components/schemas/OracleJob" },
            big: { type: "string" },
          },
        },
        OracleTask: {
          type: "object",
          minProperties: 1,
          properties: {
            switchboardAddress: { type: "string" },
            pythAddress: { type: "string" },
            chainlinkAddress: { type: "string" },
            pythAllowedConfidenceInterval: { type: "number" },
          },
        },
        PancakeswapExchangeRateTask: { type: "object" },
        PerpMarketTask: { type: "object" },
        PowTask: {
          type: "object",
          minProperties: 1,
          maxProperties: 1,
          properties: {
            scalar: { type: "number" },
            aggregatorPubkey: { type: "string" },
            big: { type: "string" },
          },
        },
        RegexExtractTask: {
          type: "object",
          required: ["pattern"],
          properties: {
            pattern: {
              type: "string",
            },
            groupNumber: {
              type: "string",
            },
          },
        },
        RoundTask: {
          type: "object",
          properties: {
            method: {
              type: "string",
              enum: ["METHOD_ROUND_UP", "METHOD_ROUND_DOWN"],
            },
            decimals: { type: "number" },
          },
        },
        SerumSwapTask: {
          type: "object",
          required: ["serumPoolAddress"],
          properties: { serumPoolAddress: { type: "string" } },
        },
        SolanaAccountDataFetchTask: {
          type: "object",
          required: ["pubkey"],
          properties: { pubkey: { type: "string" } },
        },
        SplStakePoolTask: {
          type: "object",
          required: ["pubkey"],
          properties: { pubkey: { type: "string" } },
        },
        SplTokenParseTask: {
          type: "object",
          minProperties: 1,
          maxProperties: 1,
          properties: {
            tokenAccountAddress: { type: "string" },
            mintAddress: { type: "string" },
          },
        },
        SubtractTask: {
          type: "object",
          minProperties: 1,
          maxProperties: 1,
          properties: {
            scalar: { type: "number" },
            aggregatorPubkey: { type: "string" },
            job: { $ref: "#/components/schemas/OracleJob" },
            big: { type: "string" },
          },
        },
        SushiswapExchangeRateTask: { type: "object" },
        SysclockOffsetTask: { type: "object" },
        TpsTask: { type: "object" },
        TwapTask: {
          type: "object",
          required: ["aggregatorPubkey", "period"],
          properties: {
            aggregatorPubkey: { type: "string" },
            period: { type: "number" },
            weightByPropagationTime: { type: "boolean" },
            minSamples: { type: "number" },
            endingUnixTimestamp: { type: "number" },
            endingUnixTimestampTask: {
              $ref: "#/components/schemas/CronParseTask",
            },
          },
          example: {
            aggregatorPubkey: "GvDMxPzN1sCj7L26YDK2HnMRXEQmQ2aemov8YBtPS7vR",
            period: 1800,
          },
        },
        UniswapExchangeRateTask: { type: "object" },
        VwapTask: { type: "object" },
        XstepPriceTask: { type: "object" },
        // TaskRequest: {
        //   type: "object",
        //   required: ["task"],
        //   properties: {
        //     cluster: { type: "string", enum: ["mainnet-beta", "devnet"] },
        //     input: { type: "string" },
        //     task: { $ref: "#/components/schemas/ITask" },
        //   },
        // },
        Error: {
          type: "object",
          properties: {
            code: {
              type: "number",
            },
            message: {
              type: "string",
            },
          },
        },
      },
      responses: {
        BadRequest: {
          description: "Bad request",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/Error",
              },
              example: {
                code: 400,
                message: "Bad request",
              },
            },
          },
        },
        Unauthorized: {
          description: "Unauthorized",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/Error",
              },
              example: {
                code: 401,
                message: "Please authenticate",
              },
            },
          },
        },
        Forbidden: {
          description: "Forbidden",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/Error",
              },
              example: {
                code: 403,
                message: "Forbidden",
              },
            },
          },
        },
        NotFound: {
          description: "Not found",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/Error",
              },
              example: {
                code: 403,
                message: "Not found",
              },
            },
          },
        },
      },
    },
  },
  apis: ["./src/models/*", "./src/routes/*"],
};

const swaggerDocument = swaggerJsdoc(options);

export default swaggerDocument;
