export {};

/**
 * @swagger
 * components:
 *    schemas:
 *      OracleJob:
 *        type: object
 *        required:
 *        - tasks
 *        properties:
 *          name:
 *            type: string
 *          tasks:
 *            type: array
 *            items:
 *              "$ref": "#/components/schemas/ITask"
 *        example:
 *          name: BinanceCom BTC/USD
 *          tasks:
 *          - httpTask:
 *              url: https://www.binance.com/api/v3/ticker/price?symbol=BTCUSDT
 *          - jsonParseTask:
 *              path: "$.price"
 *          - multiplyTask:
 *              aggregatorPubkey: ETAaeeuQBwsh9mC2gCov9WdhJENZuffRMXY2HgjCcSL9
 */

/**
 * components:
 *    schemas:
 *      ITask:
 *        type: object
 *        oneOf:
 *          - $ref: '#/components/schemas/HttpTask'
 *          - $ref: '#/components/schemas/WebsocketTask'
 *          - $ref: '#/components/schemas/CacheTask'
 *          - $ref: '#/components/schemas/JsonParseTask'
 *          - $ref: '#/components/schemas/ValueTask'
 *          - $ref: '#/components/schemas/JupiterSwapTask'
 *          - $ref: '#/components/schemas/AddTask'
 *          - $ref: '#/components/schemas/ComparisonTask'
 */

/**
 * @swagger
 * components:
 *    schemas:
 *      IHttpTask:
 *        type: object
 *        required:
 *          - url
 *        properties:
 *          url:
 *            type: string
 *          method:
 *            type: string
 *            enum:
 *              - METHOD_UNKNOWN
 *              - METHOD_GET
 *              - METHOD_POST
 *            default: METHOD_UNKNOWN
 *          headers:
 *            type: string
 *          body:
 *            type: string
 *      HttpTask:
 *        type: object
 *        required:
 *          - httpTask
 *        properties:
 *          httpTask:
 *            $ref: "#/components/schemas/IHttpTask"
 *        example:
 *          httpTask:
 *            url: https://www.binance.com/api/v3/ticker/price?symbol=BTCUSDT
 *            method: METHOD_GET
 */

/**
 * @swagger
 * components:
 *    schemas:
 *      IWebsocketTask:
 *        type: object
 *        required:
 *        - url
 *        - subscription
 *        properties:
 *          url:
 *            type: string
 *          subscription:
 *            type: string
 *          maxDataAgeSeconds:
 *            type: number
 *          filter:
 *            type: string
 *      WebsocketTask:
 *        type: object
 *        required:
 *          - websocketTask
 *        properties:
 *          websocketTask:
 *            $ref: "#/components/schemas/IWebsocketTask"
 *        example:
 *          websocketTask:
 *            url: wss://ws-feed.pro.coinbase.com
 *            subscription: '{"type":"subscribe","product_ids":["BTC-USD"],"channels":["ticker",{"name":"ticker","product_ids":["BTC-USD"]}]}'
 *            maxDataAgeSeconds: 15
 *            filter: "$[?(@.type == 'ticker' && @.product_id == 'BTC-USD')]"
 */

/**
 * @swagger
 * components:
 *    schemas:
 *      CacheItem:
 *        type: object
 *        required:
 *          - variableName
 *          - job
 *        properties:
 *          variableName:
 *            type: string
 *          job:
 *            $ref: "#/components/schemas/OracleJob"
 *        example:
 *          variableName: "ONE"
 *          job:
 *            tasks:
 *            - valueTask:
 *              value: 1
 *      ICacheTask:
 *        type: object
 *        required:
 *          - cacheItems
 *        properties:
 *          cacheItems:
 *            type: array
 *            items:
 *              $ref: "#/components/schemas/CacheItem"
 *      CacheTask:
 *        type: object
 *        required:
 *          - cacheTask
 *        properties:
 *          cacheTask:
 *            $ref: "#/components/schemas/ICacheTask"
 *        example:
 *          cacheTask:
 *            cacheItems:
 *            -
 *              variableName: "ONE"
 *              job:
 *                tasks:
 *                -
 *                  valueTask:
 *                    value: 1
 *            -
 *              variableName: "TEN"
 *              job:
 *               tasks:
 *               -
 *                 valueTask:
 *                   value: 10
 */

/**
 * @swagger
 * components:
 *    schemas:
 *      IJsonParseTask:
 *        type: object
 *        required:
 *        - inTokenAddress
 *        - outTokenAddress
 *        properties:
 *          path:
 *            type: string
 *          aggregationMethod:
 *            type: string
 *            default: NONE
 *            enum:
 *            - NONE
 *            - MIN
 *            - MAX
 *            - SUM
 *            - MEAN
 *            - MEDIAN
 *        example:
 *          path: "$.price"
 *      JsonParseTask:
 *        type: object
 *        required:
 *          - jsonParseTask
 *        properties:
 *          jsonParseTask:
 *            $ref: "#/components/schemas/IJsonParseTask"
 *        example:
 *          jsonParseTask:
 *            path: "$.prirce"
 */

/**
 * @swagger
 * components:
 *    schemas:
 *      IValueTask:
 *        type: object
 *        minProperties: 1
 *        properties:
 *          value:
 *            type: number
 *          aggregatorPubkey:
 *            type: string
 *          big:
 *            type: string
 *        example:
 *          big: "1337.1337"
 *      ValueTask:
 *        type: object
 *        required:
 *          - valueTask
 *        properties:
 *          valueTask:
 *            $ref: "#/components/schemas/IValueTask"
 *        example:
 *          valueTask:
 *            value: 420.69
 */

/**
 * @swagger
 * components:
 *    schemas:
 *      IJupiterSwapTask:
 *        type: object
 *        required:
 *        - inTokenAddress
 *        - outTokenAddress
 *        properties:
 *          inTokenAddress:
 *            type: string
 *          outTokenAddress:
 *            type: string
 *          baseAmount:
 *            type: number
 *          allowList:
 *            type: array
 *            items:
 *              type: string
 *          denyList:
 *            type: array
 *            items:
 *              type: string
 *        example:
 *          inTokenAddress: So11111111111111111111111111111111111111112
 *          outTokenAddress: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
 *          baseAmount: 100
 *      JupiterSwapTask:
 *        type: object
 *        required:
 *          - jupiterSwapTask
 *        properties:
 *          jupiterSwapTask:
 *            $ref: "#/components/schemas/IJupiterSwapTask"
 *        example:
 *          jupiterSwapTask:
 *            inTokenAddress: So11111111111111111111111111111111111111112
 *            outTokenAddress: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
 *            baseAmount: 100
 */

/**
 * @swagger
 * components:
 *    schemas:
 *      IAddTask:
 *        type: object
 *        properties:
 *          scalar:
 *            type: number
 *          job:
 *            $ref: '#/components/schemas/OracleJob'
 *          big:
 *            type: string
 *      AddTask:
 *        type: object
 *        required:
 *          - addTask
 *        properties:
 *          addTask:
 *            $ref: "#/components/schemas/IAddTask"
 *        example:
 *          addTask:
 *            scalar: 10
 */

/**
 * @swagger
 * components:
 *    schemas:
 *      IComparisonTask:
 *        type: object
 *        properties:
 *          op:
 *            type: string
 *            enum:
 *            - OPERATION_EQ
 *            - OPERATION_GT
 *            - OPERATION_LT
 *            default: OPERATION_EQ
 *          lhs:
 *            "$ref": "#/components/schemas/OracleJob"
 *          lhsValue:
 *            type: string
 *          rhs:
 *            "$ref": "#/components/schemas/OracleJob"
 *          rhsValue:
 *            type: string
 *          onTrue:
 *            "$ref": "#/components/schemas/OracleJob"
 *          onTrueValue:
 *            type: string
 *          onFalse:
 *            "$ref": "#/components/schemas/OracleJob"
 *          onFalseValue:
 *            type: string
 *          onFailure:
 *            "$ref": "#/components/schemas/OracleJob"
 *          onFailureValue:
 *            type: string
 *      ComparisonTask:
 *        type: object
 *        required:
 *          - comparisonTask
 *        properties:
 *          comparisonTask:
 *            $ref: "#/components/schemas/IComparisonTask"
 *        example:
 *          comparisonTask:
 *            op: OPERATION_GT
 *            lhs:
 *              tasks:
 *              - valueTask:
 *                  big: "${JOB_OUTPUT}"
 *            rhs:
 *              tasks:
 *              - valueTask:
 *                  big: '0'
 *            onTrue:
 *              tasks:
 *              - valueTask:
 *                  big: "${JOB_OUTPUT}"
 */

/** ################################################################################# */

/**
 * components:
 *    schemas:
 *      ITask:
 *        type: object
 *        minProperties: 1
 *        maxProperties: 1
 *        oneOf:
 *          - addTask
 *          - anchorFetchTask
 *          - boundTask
 *          - bufferLayoutParseTask
 *          - cacheTask
 *          - comparisonTask
 *          - conditionalTask
 *          - cronParseTask
 *          - defiKingdomsTask
 *          - divideTask
 *          - ewmaTask
 *          - historyFunctionTask
 *          - httpTask
 *          - jsonParseTask
 *          - jupiterSwapTask
 *          - lendingRateTask
 *          - lpExchangeRateTask
 *          - lpTokenPriceTask
 *          - mangoPerpMarketTask
 *          - marinadeStateTask
 *          - maxTask
 *          - meanTask
 *          - medianTask
 *          - minTask
 *          - multiplyTask
 *          - oracleTask
 *          - pancakeswapExchangeRateTask
 *          - perpMarketTask
 *          - powTask
 *          - regexExtractTask
 *          - roundTask
 *          - serumSwapTask
 *          - solanaAccountDataFetchTask
 *          - splStakePoolTask
 *          - splTokenParseTask
 *          - subtractTask
 *          - sushiswapExchangeRateTask
 *          - sysclockOffsetTask
 *          - twapTask
 *          - uniswapExchangeRateTask
 *          - valueTask
 *          - vwapTask
 *          - websocketTask
 *          - xstepPriceTask
 *        properties:
 *          addTask:
 *            $ref: '#/components/schemas/AddTask'
 *          anchorFetchTask:
 *            $ref: '#/components/schemas/AnchorFetchTask'
 *          boundTask:
 *            $ref: '#/components/schemas/BoundTask'
 *          bufferLayoutParseTask:
 *            $ref: '#/components/schemas/BufferLayoutParseTask'
 *          cacheTask:
 *            $ref: '#/components/schemas/CacheTask'
 *          comparisonTask:
 *            $ref: '#/components/schemas/ComparisonTask'
 *          conditionalTask:
 *            $ref: '#/components/schemas/ConditionalTask'
 *          cronParseTask:
 *            $ref: '#/components/schemas/CronParseTask'
 *          defiKingdomsTask:
 *            $ref: '#/components/schemas/DefiKingdomsTask'
 *          divideTask:
 *            $ref: '#/components/schemas/DivideTask'
 *          ewmaTask:
 *            $ref: '#/components/schemas/EwmaTask'
 *          historyFunctionTask:
 *            $ref: '#/components/schemas/HistoryFunctionTask'
 *          httpTask:
 *            $ref: '#/components/schemas/HttpTask'
 *          jsonParseTask:
 *            $ref: '#/components/schemas/JsonParseTask'
 *          jupiterSwapTask:
 *            $ref: '#/components/schemas/JupiterSwapTask'
 *          lendingRateTask:
 *            $ref: '#/components/schemas/LendingRateTask'
 *          lpExchangeRateTask:
 *            $ref: '#/components/schemas/LpExchangeRateTask'
 *          lpTokenPriceTask:
 *            $ref: '#/components/schemas/LpTokenPriceTask'
 *          mangoPerpMarketTask:
 *            $ref: '#/components/schemas/MangoPerpMarketTask'
 *          marinadeStateTask:
 *            $ref: '#/components/schemas/MarinadeStateTask'
 *          maxTask:
 *            $ref: '#/components/schemas/MaxTask'
 *          meanTask:
 *            $ref: '#/components/schemas/MeanTask'
 *          medianTask:
 *            $ref: '#/components/schemas/MedianTask'
 *          minTask:
 *            $ref: '#/components/schemas/MinTask'
 *          multiplyTask:
 *            $ref: '#/components/schemas/MultiplyTask'
 *          oracleTask:
 *            $ref: '#/components/schemas/OracleTask'
 *          pancakeswapExchangeRateTask:
 *            $ref: '#/components/schemas/PancakeswapExchangeRateTask'
 *          perpMarketTask:
 *            $ref: '#/components/schemas/PerpMarketTask'
 *          powTask:
 *            $ref: '#/components/schemas/PowTask'
 *          regexExtractTask:
 *            $ref: '#/components/schemas/RegexExtractTask'
 *          roundTask:
 *            $ref: '#/components/schemas/RoundTask'
 *          serumSwapTask:
 *            $ref: '#/components/schemas/SerumSwapTask'
 *          solanaAccountDataFetchTask:
 *            $ref: '#/components/schemas/SolanaAccountDataFetchTask'
 *          splStakePoolTask:
 *            $ref: '#/components/schemas/SplStakePoolTask'
 *          splTokenParseTask:
 *            $ref: '#/components/schemas/SplTokenParseTask'
 *          subtractTask:
 *            $ref: '#/components/schemas/SubtractTask'
 *          sushiswapExchangeRateTask:
 *            $ref: '#/components/schemas/SushiswapExchangeRateTask'
 *          sysclockOffsetTask:
 *            $ref: '#/components/schemas/SysclockOffsetTask'
 *          tpsTask:
 *            $ref: '#/components/schemas/TpsTask'
 *          twapTask:
 *            $ref: '#/components/schemas/TwapTask'
 *          uniswapExchangeRateTask:
 *            $ref: '#/components/schemas/UniswapExchangeRateTask'
 *          valueTask:
 *            $ref: '#/components/schemas/ValueTask'
 *          vwapTask:
 *            $ref: '#/components/schemas/VwapTask'
 *          websocketTask:
 *            $ref: '#/components/schemas/WebsocketTask'
 *          xstepPriceTask:
 *            $ref: '#/components/schemas/XstepPriceTask'
 */

/**
 * components:
 *    schemas:
 *      EwmaTask:
 *        type: object
 *      HistoryFunctionTask:
 *        type: object
 *      HttpTask:
 *        type: object
 *      JsonParseTask:
 *        type: object
 *      JupiterSwapTask:
 *        type: object
 *      LendingRateTask:
 *        type: object
 *      LpExchangeRateTask:
 *        type: object
 *      LpTokenPriceTask:
 *        type: object
 *      MangoPerpMarketTask:
 *        type: object
 *      MarinadeStateTask:
 *        type: object
 *      MaxTask:
 *        type: object
 *      MeanTask:
 *        type: object
 *      MedianTask:
 *        type: object
 *      MinTask:
 *        type: object
 *      MultiplyTask:
 *        type: object
 *      OracleTask:
 *        type: object
 *      PancakeswapExchangeRateTask:
 *        type: object
 *      PerpMarketTask:
 *        type: object
 *      PowTask:
 *        type: object
 *      RegexExtractTask:
 *        type: object
 *      RoundTask:
 *        type: object
 *      SerumSwapTask:
 *        type: object
 *      SolanaAccountDataFetchTask:
 *        type: object
 *      SplStakePoolTask:
 *        type: object
 *      SplTokenParseTask:
 *        type: object
 *      SubtractTask:
 *        type: object
 *      SushiswapExchangeRateTask:
 *        type: object
 *      SysclockOffsetTask:
 *        type: object
 *      TpsTask:
 *        type: object
 *      TwapTask:
 *        type: object
 *      UniswapExchangeRateTask:
 *        type: object
 *      ValueTask:
 *        type: object
 *      VwapTask:
 *        type: object
 *      WebsocketTask:
 *        type: object
 *      XstepPriceTask:
 *        type: object
 */
