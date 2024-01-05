// import { debugLogging } from "../utils";

// import {
//   deploySwitchboardFixture,
//   deploySwitchboardWithQueueAndOracleFixture,
// } from "./fixtures";

// import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
// import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
// import { AggregatorAccount, sendTxnWithOptions } from "@switchboard-xyz/evm.js";
// import { expect } from "chai";
// import hre, { ethers } from "hardhat";

// // deploy switchboard fixture
// describe("Switchboard", () => {
//   describe("Deployment", () => {
//     it("Should create queue", async () => {
//       const { sb, owner } = await loadFixture(deploySwitchboardFixture);

//       const tx = await sb.createOracleQueue(
//         "switchboard_queue",
//         owner.address,
//         true,
//         32,
//         0,
//         180
//       );

//       const queueAddress = await tx.wait().then((logs: { logs: any[] }) => {
//         const log = logs.logs[0];
//         const sbLog = sb.interface.parseLog(log);
//         return sbLog.args.accountId as string;
//       });

//       expect(await sb.oracleQueues(queueAddress)).to.not.equal(undefined);
//     });

//     it("Should create oracle", async () => {
//       const { sb, owner } = await loadFixture(deploySwitchboardFixture);

//       const queueAddress = await sb
//         .createOracleQueue("switchboard_queue", owner.address, true, 32, 0, 180)
//         .then((tx: { wait: () => Promise<any> }) => {
//           return tx.wait().then((logs: { logs: any[] }) => {
//             const log = logs.logs[0];
//             const sbLog = sb.interface.parseLog(log);
//             return sbLog.args.accountId as string;
//           });
//         });

//       const tx = await sb.createOracle(
//         "switchboard_oracle",
//         owner.address,
//         queueAddress,
//         owner.address
//       );

//       const oracleAddress = await tx.wait().then((logs: { logs: any[] }) => {
//         const log = logs.logs[0];
//         const sbLog = sb.interface.parseLog(log);
//         return sbLog.args.accountId as string;
//       });

//       // check that the correct types have been made
//       expect(await sb.oracles(oracleAddress)).to.not.equal(undefined);
//     });

//     it("Should create aggregator", async () => {
//       const { switchboard, sb, owner, queueAccount, oracleAccount } =
//         await loadFixture(deploySwitchboardWithQueueAndOracleFixture);

//       const tx = await sb.createAggregator(
//         "switchboard_feed",
//         owner.address,
//         1,
//         0,
//         1,
//         "",
//         queueAccount.address,
//         0,
//         1,
//         0,
//         false // enable history
//       );

//       const aggregatorAddress = await tx
//         .wait()
//         .then((logs: { logs: any[] }) => {
//           const log = logs.logs[0];
//           const sbLog = sb.interface.parseLog(log);
//           return sbLog.args.accountId as string;
//         });

//       const aggregator = await sb.aggregators(aggregatorAddress);
//       const oracle = await sb.oracles(oracleAccount.address);
//       expect(aggregator.config.batchSize).to.equal(1);
//       expect(oracle.name).to.equal("");
//     });

//     it("Should resolve feed", async () => {
//       const { sb, owner, queueAccount, oracleAccount } = await loadFixture(
//         deploySwitchboardWithQueueAndOracleFixture
//       );

//       const tx = await sb.createAggregator(
//         "switchboard_feed",
//         owner.address,
//         1,
//         0,
//         1,
//         "jobs_hash_goes_here",
//         queueAccount.address,
//         0,
//         1,
//         0,
//         false
//       );

//       const aggregatorAddress = await tx
//         .wait()
//         .then((logs: { logs: any[] }) => {
//           const log = logs.logs[0];
//           const sbLog = sb.interface.parseLog(log);
//           return sbLog.args.accountId as string;
//         });

//       // add test for aggregator addresses and aggregators - this will save a lot of money in RPC calls :)
//       const [aggregatorAddresses, aggregators] =
//         await sb.getAggregatorsByAuthority(owner.address);
//       expect(aggregatorAddresses[0]).to.deep.equal(aggregatorAddress);

//       // check that the correct types have been made
//       // expect(await sb.aggregatorExists(aggregatorAddress)).to.equal(true);
//       // expect(await sb.queueExists(queueAccount.address)).to.equal(true);
//       // expect(await sb.oracleExists(oracleAccount.address)).to.equal(true);

//       const aggregator = await sb.aggregators(aggregatorAddress);
//       expect(aggregator.jobsHash).to.equal("jobs_hash_goes_here");

//       // heartbeat oracle onto queue - technically unnecessary
//       // await sb.heartbeat(oracleAccount.address);
//       await oracleAccount.heartbeat();

//       // resolve round
//       await expect(
//         sendTxnWithOptions(
//           sb,
//           "saveResults",
//           [[aggregatorAddress], [5], queueAccount.address, 0],
//           { gasFactor: 1.25, simulate: true }
//         )
//       )
//         .to.emit(sb, "AggregatorUpdate")
//         .withArgs(aggregatorAddress, 5, anyValue);
//     });
//   });

//   it("Should resolve feed with multiple oracles", async () => {
//     const { sb, owner, queueAccount, oracleAccount } = await loadFixture(
//       deploySwitchboardWithQueueAndOracleFixture
//     );

//     debugLogging(`Creating aggregator`);

//     const aggregatorAddress = await (
//       await sb.createAggregator(
//         "switchboard_feed",
//         owner.address,
//         3,
//         0,
//         3,
//         "jobs_hash_goes_here",
//         queueAccount.address,
//         0,
//         1,
//         0,
//         false
//       )
//     )
//       .wait()
//       .then((logs: { logs: any[] }) => {
//         const log = logs.logs[0];
//         const sbLog = sb.interface.parseLog(log);
//         return sbLog.args.accountId as string;
//       });

//     debugLogging(`Oracle heartbeat`);
//     await oracleAccount.heartbeat();

//     // generate 2 other oracles

//     // 2
//     debugLogging(`Create oracle #2`);
//     const [oracleAccount2] = await queueAccount.createOracle();

//     debugLogging(`oracle #2 heartbeat`);
//     await oracleAccount2.heartbeat();

//     // 3
//     debugLogging(`Create oracle #3`);
//     const [oracleAccount3] = await queueAccount.createOracle();

//     debugLogging(`oracle #3 heartbeat`);
//     await oracleAccount3.heartbeat();

//     // resolve round
//     debugLogging(`save_result #1`);
//     await expect(
//       sendTxnWithOptions(
//         sb,
//         "saveResults",
//         [[aggregatorAddress], [1], queueAccount.address, 0],
//         { gasFactor: 1.25, simulate: true }
//       )
//     )
//       .to.emit(sb, "AggregatorSaveResult")
//       .withArgs(aggregatorAddress, oracleAccount.address, 1)
//       .to.not.emit(sb, "AggregatorUpdate");

//     debugLogging(`save_result #2`);
//     await expect(
//       sendTxnWithOptions(
//         sb,
//         "saveResults",
//         [[aggregatorAddress], [3], queueAccount.address, 1],
//         { gasFactor: 1.25, simulate: true }
//       )
//     )
//       .to.emit(sb, "AggregatorSaveResult")
//       .withArgs(aggregatorAddress, oracleAccount2.address, 3);

//     // check that the round has not been closed
//     debugLogging(`save_result #3`);
//     await expect(
//       sendTxnWithOptions(
//         sb,
//         "saveResults",
//         [[aggregatorAddress], [7], queueAccount.address, 2],
//         { gasFactor: 1.25, simulate: true }
//       )
//     )
//       .to.emit(sb, "AggregatorUpdate")
//       .withArgs(aggregatorAddress, 3, anyValue); // result should be 3

//     // resolve rounds
//     debugLogging(`save_result #4`);
//     await expect(
//       sendTxnWithOptions(
//         sb,
//         "saveResults",
//         [[aggregatorAddress], [2], queueAccount.address, 0],
//         { gasFactor: 1.25, simulate: true }
//       )
//     )
//       .to.emit(sb, "AggregatorSaveResult")
//       .withArgs(aggregatorAddress, oracleAccount.address, 2);

//     await expect(
//       sendTxnWithOptions(
//         sb,
//         "saveResults",
//         [[aggregatorAddress], [7], queueAccount.address, 1],
//         { gasFactor: 1.25, simulate: true }
//       )
//     )
//       .to.emit(sb, "AggregatorSaveResult")
//       .withArgs(aggregatorAddress, oracleAccount2.address, 7);

//     await expect(
//       sendTxnWithOptions(
//         sb,
//         "saveResults",
//         [[aggregatorAddress], [9], queueAccount.address, 2],
//         { gasFactor: 1.25, simulate: true }
//       )
//     )
//       .to.emit(sb, "AggregatorUpdate")
//       .withArgs(aggregatorAddress, 7, anyValue); // result should be 7

//     await expect(
//       sendTxnWithOptions(
//         sb,
//         "saveResults",
//         [[aggregatorAddress], [9], queueAccount.address, 0],
//         { gasFactor: 1.25, simulate: true }
//       )
//     )
//       .to.emit(sb, "AggregatorUpdate")
//       .withArgs(aggregatorAddress, 9, anyValue); // result should be 9

//     const tx = await sendTxnWithOptions(
//       sb,
//       "saveResults",
//       [[aggregatorAddress], [9], queueAccount.address, 0],
//       { gasFactor: 1.25, simulate: true }
//     );
//     const receipt = await tx.wait();
//     debugLogging(receipt.gasUsed.toString(), "GAS USED");

//     //// AGGREGATOR 2 to see how gas scales with more saves

//     const aggregator2Address = await (
//       await sb.createAggregator(
//         "switchboard_feed",
//         owner.address,
//         3,
//         0,
//         3,
//         "jobs_hash_goes_here",
//         queueAccount.address,
//         0,
//         2,
//         0,
//         false
//       )
//     )
//       .wait()
//       .then((logs: { logs: any[] }) => {
//         const log = logs.logs[0];
//         const sbLog = sb.interface.parseLog(log);
//         return sbLog.args.accountId as string;
//       });

//     await expect(
//       sendTxnWithOptions(
//         sb,
//         "saveResults",
//         [[aggregator2Address], [9], queueAccount.address, 0],
//         { gasFactor: 1.25, simulate: true }
//       )
//     )
//       .to.emit(sb, "AggregatorSaveResult")
//       .withArgs(aggregator2Address, oracleAccount.address, 9);

//     await expect(
//       sendTxnWithOptions(
//         sb,

//         "saveResults",
//         [[aggregator2Address], [8], queueAccount.address, 1],
//         { gasFactor: 1.25, simulate: true }
//       )
//     )
//       .to.emit(sb, "AggregatorSaveResult")
//       .withArgs(aggregator2Address, oracleAccount2.address, 8);

//     // trigger updates on 2 different oracles to see how it scales
//     await expect(
//       sendTxnWithOptions(
//         sb,

//         "saveResults",
//         [[aggregator2Address], [10], queueAccount.address, 2],
//         { gasFactor: 1.25, simulate: true }
//       )
//     )
//       .to.emit(sb, "AggregatorUpdate")
//       .withArgs(aggregator2Address, 9, anyValue); // result should be 9

//     // trigger updates on 2 different oracles to see how it scales
//     const tx2 = await sendTxnWithOptions(
//       sb,
//       "saveResults",
//       [
//         [aggregatorAddress, aggregator2Address],
//         [9, 10],
//         queueAccount.address,
//         2,
//       ],
//       { gasFactor: 1.25, simulate: true }
//     );
//     const receipt1 = await tx2.wait();
//     console.log(receipt1.gasUsed.toString(), "GAS USED 2");

//     // get gas diff
//     console.log(
//       receipt1.gasUsed.toNumber() - receipt.gasUsed.toNumber(),
//       "GAS DIFF"
//     );
//   });

//   it("Should resolve feed with multiple oracles AND ADAPTERS", async () => {
//     const { sb, owner, queueAccount, oracleAccount } = await loadFixture(
//       deploySwitchboardWithQueueAndOracleFixture
//     );

//     const aggregatorAddress = await (
//       await sb.createAggregator(
//         "switchboard_feed",
//         owner.address,
//         3,
//         0,
//         3,
//         "jobs_hash_goes_here",
//         queueAccount.address,
//         0,
//         1,
//         0,
//         true
//       )
//     )
//       .wait()
//       .then((logs: { logs: any[] }) => {
//         const log = logs.logs[0];
//         const sbLog = sb.interface.parseLog(log);
//         return sbLog.args.accountId as string;
//       });

//     // check that the correct types have been made
//     // expect(await sb.aggregatorExists(aggregatorAddress)).to.equal(true);
//     // expect(await sb.queueExists(queueAccount.address)).to.equal(true);
//     // expect(await sb.oracleExists(oracleAccount.address)).to.equal(true);

//     // heartbeat oracle onto queue
//     await sb.oracleHeartbeat(oracleAccount.address);

//     // generate 2 other oracles

//     // 2
//     debugLogging(`Create oracle #2`);
//     const [oracleAccount2] = await queueAccount.createOracle();

//     debugLogging(`oracle #2 heartbeat`);
//     await oracleAccount2.heartbeat();

//     // 3
//     debugLogging(`Create oracle #3`);
//     const [oracleAccount3] = await queueAccount.createOracle();

//     debugLogging(`oracle #3 heartbeat`);
//     await oracleAccount3.heartbeat();

//     // resolve round
//     debugLogging(`save_result #1`);
//     await expect(
//       sendTxnWithOptions(
//         sb,

//         "saveResults",
//         [[aggregatorAddress], [1], queueAccount.address, 0],
//         { gasFactor: 1.25, simulate: true }
//       )
//     )
//       .to.emit(sb, "AggregatorSaveResult")
//       .withArgs(aggregatorAddress, oracleAccount.address, 1)
//       .to.not.emit(sb, "AggregatorUpdate");

//     debugLogging(`save_result #2`);
//     await expect(
//       sendTxnWithOptions(
//         sb,
//         "saveResults",
//         [[aggregatorAddress], [3], queueAccount.address, 1],
//         { gasFactor: 1.25, simulate: true }
//       )
//     )
//       .to.emit(sb, "AggregatorSaveResult")
//       .withArgs(aggregatorAddress, oracleAccount2.address, 3);

//     // check that the round has not been closed
//     debugLogging(`save_result #3`);
//     await expect(
//       sendTxnWithOptions(
//         sb,

//         "saveResults",
//         [[aggregatorAddress], [7], queueAccount.address, 2],
//         { gasFactor: 1.25, simulate: true }
//       )
//     )
//       .to.emit(sb, "AggregatorUpdate")
//       .withArgs(aggregatorAddress, 3, anyValue); // result should be 3

//     // resolve rounds
//     debugLogging(`save_result #4`);
//     await expect(
//       sendTxnWithOptions(
//         sb,
//         "saveResults",
//         [[aggregatorAddress], [2], queueAccount.address, 0],
//         { gasFactor: 1.25, simulate: true }
//       )
//     )
//       .to.emit(sb, "AggregatorSaveResult")
//       .withArgs(aggregatorAddress, oracleAccount.address, 2);

//     debugLogging(`save_result #5`);
//     await expect(
//       sendTxnWithOptions(
//         sb,
//         "saveResults",
//         [[aggregatorAddress], [7], queueAccount.address, 1],
//         { gasFactor: 1.25, simulate: true }
//       )
//     )
//       .to.emit(sb, "AggregatorSaveResult")
//       .withArgs(aggregatorAddress, oracleAccount2.address, 7);

//     debugLogging(`save_result #6`);
//     await expect(
//       sendTxnWithOptions(
//         sb,
//         "saveResults",
//         [[aggregatorAddress], [9], queueAccount.address, 2],
//         { gasFactor: 1.25, simulate: true }
//       )
//     )
//       .to.emit(sb, "AggregatorUpdate")
//       .withArgs(aggregatorAddress, 7, anyValue); // result should be 7

//     debugLogging(`save_result #17`);
//     await expect(
//       sendTxnWithOptions(
//         sb,
//         "saveResults",
//         [[aggregatorAddress], [9], queueAccount.address, 0],
//         { gasFactor: 1.25, simulate: true }
//       )
//     )
//       .to.emit(sb, "AggregatorUpdate")
//       .withArgs(aggregatorAddress, 9, anyValue); // result should be 9

//     debugLogging(`save_result #8`);
//     const tx = await sendTxnWithOptions(
//       sb,
//       "saveResults",
//       [[aggregatorAddress], [9], queueAccount.address, 0],
//       { gasFactor: 1.25, simulate: true }
//     );
//     const receipt = await tx.wait();
//     debugLogging(receipt.gasUsed.toString(), "GAS USED WITH ADAPTER");

//     //// AGGREGATOR 2 to see how gas scales with more saves

//     const aggregator2Address = await (
//       await sb.createAggregator(
//         "switchboard_feed",
//         owner.address,
//         3,
//         0,
//         3,
//         "jobs_hash_goes_here",
//         queueAccount.address,
//         0,
//         2,
//         0,
//         true
//       )
//     )
//       .wait()
//       .then((logs: { logs: any[] }) => {
//         const log = logs.logs[0];
//         const sbLog = sb.interface.parseLog(log);
//         return sbLog.args.accountId as string;
//       });

//     debugLogging(`next save_result #1`);
//     await expect(
//       sendTxnWithOptions(
//         sb,
//         "saveResults",
//         [[aggregator2Address], [9], queueAccount.address, 0],
//         { gasFactor: 1.25, simulate: true }
//       )
//     )
//       .to.emit(sb, "AggregatorSaveResult")
//       .withArgs(aggregator2Address, oracleAccount.address, 9);

//     await expect(
//       sendTxnWithOptions(
//         sb,
//         "saveResults",
//         [[aggregator2Address], [8], queueAccount.address, 1],
//         { gasFactor: 1.25, simulate: true }
//       )
//     )
//       .to.emit(sb, "AggregatorSaveResult")
//       .withArgs(aggregator2Address, oracleAccount2.address, 8);

//     // trigger updates on 2 different oracles to see how it scales
//     await expect(
//       sendTxnWithOptions(
//         sb,
//         "saveResults",
//         [[aggregator2Address], [10], queueAccount.address, 2],
//         { gasFactor: 1.25, simulate: true }
//       )
//     )
//       .to.emit(sb, "AggregatorUpdate")
//       .withArgs(aggregator2Address, 9, anyValue); // result should be 9

//     // trigger updates on 2 different oracles to see how it scales
//     const tx2 = await sendTxnWithOptions(
//       sb,
//       "saveResults",
//       [
//         [aggregatorAddress, aggregator2Address],
//         [9, 10],
//         queueAccount.address,
//         2,
//       ],
//       { gasFactor: 1.25, simulate: true }
//     );
//     const receipt1 = await tx2.wait();
//     console.log(receipt1.gasUsed.toString(), "GAS USED 2 (WITH ADAPTER)");

//     // get gas diff
//     console.log(
//       receipt1.gasUsed.toNumber() - receipt.gasUsed.toNumber(),
//       "GAS DIFF (WITH ADAPTER)"
//     );
//   });
// });
