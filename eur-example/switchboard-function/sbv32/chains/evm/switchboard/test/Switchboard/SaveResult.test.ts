// import { debugLogging } from "../utils";

// import {
//   deploySwitchboardWithFiveOraclesAndAggregatorFixture,
//   deploySwitchboardWithOracleFixture,
// } from "./fixtures";

// import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
// import { Big } from "@switchboard-xyz/common";
// import { fromBigNumber } from "@switchboard-xyz/evm.js";
// import { expect } from "chai";
// import hre, { ethers } from "hardhat";

// // deploy switchboard fixture
// describe("SaveResult", () => {
//   it("Should submit a saveResult txn successfully", async () => {
//     const { queueAccount, oracleAccount } = await loadFixture(
//       deploySwitchboardWithOracleFixture
//     );

//     const queue = await queueAccount.loadData();

//     const [aggregatorAccount] = await queueAccount.createAggregator({
//       name: "Aggregator-1",
//       batchSize: 1,
//       minOracleResults: 1,
//       minJobResults: 1,
//       minUpdateDelaySeconds: 10,
//       varianceThreshold: 0,
//       forceReportPeriod: 0,
//       jobsHash: "",
//       enableHistory: true,
//       authority: queue.authority, // queue authority is the authority now
//       fundAmount: 0,
//     });

//     const aggregator = await aggregatorAccount.loadData();

//     const oracleTx = await oracleAccount.saveManyResults({
//       queueId: queueAccount.address,
//       data: [
//         {
//           aggregatorAddress: aggregatorAccount.address,
//           value: new Big("1337.1337"),
//         },
//       ],
//     });
//     await oracleTx.wait();

//     const latestResult = await aggregatorAccount.fetchLatestResult();
//     expect(latestResult.result.toNumber()).to.equal(1337.1337);
//   });

//   it("Should submit a saveManyResults txn successfully", async () => {
//     const { queueAccount, oracleAccount } = await loadFixture(
//       deploySwitchboardWithOracleFixture
//     );

//     const queue = await queueAccount.loadData();

//     const [aggregatorAccount1] = await queueAccount.createAggregator({
//       name: "Aggregator-1",
//       batchSize: 1,
//       minOracleResults: 1,
//       minJobResults: 1,
//       minUpdateDelaySeconds: 10,
//       varianceThreshold: 0,
//       forceReportPeriod: 0,
//       jobsHash: "",
//       enableHistory: true,
//       authority: queue.authority, // queue authority is the authority now
//       fundAmount: 0,
//     });

//     const [aggregatorAccount2] = await queueAccount.createAggregator({
//       name: "Aggregator-2",
//       batchSize: 1,
//       minOracleResults: 1,
//       minJobResults: 1,
//       minUpdateDelaySeconds: 10,
//       varianceThreshold: 0,
//       forceReportPeriod: 0,
//       jobsHash: "",
//       enableHistory: true,
//       authority: queue.authority, // queue authority is the authority now
//       fundAmount: 0,
//     });

//     const oracleTx = await oracleAccount.saveManyResults({
//       queueId: queueAccount.address,
//       data: [
//         {
//           aggregatorAddress: aggregatorAccount1.address,
//           value: new Big("1337.1337"),
//         },
//         {
//           aggregatorAddress: aggregatorAccount2.address,
//           value: new Big("-42.42"),
//         },
//       ],
//     });

//     await oracleTx.wait();

//     const aggregator1 = await aggregatorAccount1.loadData();
//     const aggregator2 = await aggregatorAccount2.loadData();

//     console.log(aggregator1);
//     const result1 = fromBigNumber(aggregator1.latestResult.value);
//     expect(result1.toNumber()).to.equal(1337.1337);
//     const result2 = fromBigNumber(aggregator2.latestResult.value);
//     expect(result2.toNumber()).to.equal(-42.42);
//   });

//   it("Should resolve a value after minOracleResults are submitted", async () => {
//     const { queueAccount, oracles, aggregatorAccount } = await loadFixture(
//       deploySwitchboardWithFiveOraclesAndAggregatorFixture
//     );

//     const aggregator = await aggregatorAccount.loadData();

//     const oracleTx1 = await oracles[1].saveManyResults({
//       queueId: queueAccount.address,
//       data: [
//         {
//           aggregatorAddress: aggregatorAccount.address,
//           value: new Big("1337.1337"),
//         },
//       ],
//     });
//     await oracleTx1.wait();
//     const oracleTx2 = await oracles[2].saveManyResults({
//       queueId: queueAccount.address,
//       data: [
//         {
//           aggregatorAddress: aggregatorAccount.address,
//           value: new Big("1337.1337"),
//         },
//       ],
//     });
//     await oracleTx2.wait();

//     const oracleTx3 = await oracles[3].saveManyResults({
//       queueId: queueAccount.address,
//       data: [
//         {
//           aggregatorAddress: aggregatorAccount.address,
//           value: new Big("1337.1337"),
//         },
//       ],
//     });
//     await oracleTx3.wait();
//     const oracleTx4 = await oracles[4].saveManyResults({
//       queueId: queueAccount.address,
//       data: [
//         {
//           aggregatorAddress: aggregatorAccount.address,
//           value: new Big("1337.1337"),
//         },
//       ],
//     });
//     await oracleTx4.wait();

//     const { result, timestamp } = await aggregatorAccount.fetchLatestResult();
//     expect(result.toNumber()).to.equal(1337.1337);
//   });

//   it("Signatures", async () => {
//     const { queueAccount, oracles, aggregatorAccount } = await loadFixture(
//       deploySwitchboardWithFiveOraclesAndAggregatorFixture
//     );

//     const sb = queueAccount.switchboard.sb;
//   });
// });
