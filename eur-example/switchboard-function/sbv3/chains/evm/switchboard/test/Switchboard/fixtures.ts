// import { FacetCutAction, getSelectors } from "../../scripts/libraries/diamond";
// import type { DiamondCutFacet } from "../../typechain-types";
// import type { Switchboard } from "../../typechain-types/hardhat-diamond-abi/HardhatDiamondABI.sol/index.js";
// import { debugLogging } from "../utils";

// import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
// import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
// import type { AggregatorAccount } from "@switchboard-xyz/evm.js";
// import {
//   AttestationQueueAccount,
//   OracleAccount,
//   OracleQueueAccount,
//   Permissions,
//   PermissionStatus,
//   sendTxnWithOptions,
//   Switchboard__factory,
//   SwitchboardProgram,
// } from "@switchboard-xyz/evm.js";
// import { expect } from "chai";
// import type { ContractReceipt } from "ethers";
// import type { ContractTransaction } from "ethers";
// import { Transaction } from "ethers";
// import { TransactionDescription, TransactionTypes } from "ethers/lib/utils";
// import hre, { ethers } from "hardhat";

// const enclaveVerifierMrEnclave = Buffer.from(
//   new Uint8Array(
//     Array.from(Buffer.from("This is the enclave verifier MrEnclave"))
//       .concat(Array(32).fill(0))
//       .slice(0, 32)
//   )
// );

// const mrEnclave = Buffer.from(
//   new Uint8Array(
//     Array.from(Buffer.from("This is the default MrEnclave"))
//       .concat(Array(32).fill(0))
//       .slice(0, 32)
//   )
// );

// type SignerVsDef = {
//   address: string;
//   signer: SignerWithAddress;
// };
// type SignerSbDef = {
//   address: string;
//   signer: SignerWithAddress;
//   sb: Switchboard;
// };
// type SignerDef = SignerSbDef & SignerVsDef;

// type EnclaveDef = {
//   address: string;
//   owner: SignerVsDef;
//   authority: SignerVsDef;
// };

// type AttestationQueueDef = {
//   address: string;
//   authority: SignerVsDef;
//   enclaves: Array<EnclaveDef>;
// };

// export type SwitchboardFixture = {
//   switchboard: SwitchboardProgram;
//   sb: Switchboard;
//   owner: SignerSbDef;
//   signers: Array<SignerWithAddress>;
// };

// export type SwitchboardWithOracleFixture = SwitchboardFixture & {
//   queueAccount: OracleQueueAccount;
//   oracleAccount: OracleAccount;
// };

// export type SwitchboardWithFiveOraclesFixture = SwitchboardFixture & {
//   queueAccount: OracleQueueAccount;
//   oracles: {
//     1: OracleAccount;
//     2: OracleAccount;
//     3: OracleAccount;
//     4: OracleAccount;
//     5: OracleAccount;
//   };
// };

// export type ContractsFixture = SwitchboardFixture;

// type AttestationFixture = ContractsFixture & {
//   attestationQueue: AttestationQueueDef;
// };

// export async function deploySwitchboardFixture(): Promise<SwitchboardFixture> {
//   // Contracts are deployed using the first signer/account by default
//   const signers = await ethers.getSigners();
//   const contractOwner = signers.shift()!;

//   // deploy DiamondCutFacet
//   const DiamondCutFacet = await ethers.getContractFactory("DiamondCutFacet");
//   const diamondCutFacet = await DiamondCutFacet.deploy();
//   await diamondCutFacet.deployed();
//   console.log("DiamondCutFacet deployed:", diamondCutFacet.address);

//   // deploy Diamond
//   const Diamond = await ethers.getContractFactory(
//     "contracts/src/Switchboard/Switchboard.sol:Switchboard"
//   );
//   const diamond = await Diamond.deploy(
//     contractOwner.address,
//     diamondCutFacet.address
//   );
//   await diamond.deployed();
//   console.log("Diamond deployed:", diamond.address);

//   // deploy DiamondInit
//   // DiamondInit provides a function that is called when the diamond is upgraded to initialize state variables
//   // Read about how the diamondCut function works here: https://eips.ethereum.org/EIPS/eip-2535#addingreplacingremoving-functions
//   const DiamondInit = await ethers.getContractFactory("DiamondInit");
//   const diamondInit = await DiamondInit.deploy();
//   await diamondInit.deployed();
//   console.log("DiamondInit deployed:", diamondInit.address);

//   // deploy facets
//   console.log("");
//   console.log("Deploying facets");
//   const FacetNames = [
//     "DiamondLoupeFacet",
//     "OwnershipFacet",
//     "Aggregator",
//     "Oracle",
//     "OracleQueue",
//     "AttestationQueue",
//     "Permission",
//     "Enclave",
//     "SbFunction",
//   ];
//   const cut = [];
//   for (const FacetName of FacetNames) {
//     const Facet = await ethers.getContractFactory(FacetName);
//     const facet = await Facet.deploy();
//     await facet.deployed();
//     console.log(`${FacetName} deployed: ${facet.address}`);
//     cut.push({
//       facetAddress: facet.address,
//       action: FacetCutAction.Add,
//       functionSelectors: getSelectors(facet),
//     });
//   }

//   // upgrade diamond with facets
//   console.log("");
//   console.log("Diamond Cut:", cut);
//   const diamondCut = (await ethers.getContractAt(
//     "IDiamondCut",
//     diamond.address
//   )) as DiamondCutFacet;

//   // call to init function
//   const functionCall = diamondInit.interface.encodeFunctionData("init");
//   const tx = await diamondCut.diamondCut(
//     cut,
//     diamondInit.address,
//     functionCall
//   );
//   console.log("Diamond cut tx: ", tx.hash);
//   const receipt = await tx.wait();
//   if (!receipt.status) {
//     throw Error(`Diamond upgrade failed: ${tx.hash}`);
//   }
//   console.log("Completed diamond cut");

//   const sb = Switchboard__factory.connect(diamond.address, contractOwner);

//   // return { sb, owner };
//   return {
//     switchboard: new SwitchboardProgram(sb),
//     sb: sb,
//     owner: {
//       address: contractOwner.address,
//       signer: contractOwner,
//       sb: sb.connect(contractOwner),
//     },
//     signers,
//   };
// }

// export async function deploySwitchboardWithOracleFixture(): Promise<SwitchboardWithOracleFixture> {
//   // Contracts are deployed using the first signer/account by default
//   // const [owner, queue, oracle, user] = await ethers.getSigners();
//   const { sb, owner, signers } = await loadFixture(deploySwitchboardFixture);

//   const switchboard = new SwitchboardProgram(sb);

//   const [queueAccount] = await OracleQueueAccount.create(switchboard, {
//     name: "Queue1",
//     authority: owner.address,
//     unpermissionedFeedsEnabled: true,
//     maxSize: 32,
//     reward: 0,
//     oracleTimeout: 180,
//   });

//   // const queue = await queueAccount.loadData();

//   const [oracleAccount] = await queueAccount.createOracle();

//   const heartbeatTx = await oracleAccount.heartbeat();
//   await heartbeatTx.wait();

//   return {
//     switchboard: new SwitchboardProgram(sb as Switchboard),
//     sb: sb as Switchboard,
//     owner,
//     signers,
//     queueAccount,
//     oracleAccount,
//   };
// }

// export async function deploySwitchboardWithFiveOraclesFixture(): Promise<SwitchboardWithFiveOraclesFixture> {
//   // Contracts are deployed using the first signer/account by default
//   // const [owner, queue, oracle, user] = await ethers.getSigners();
//   const { sb, owner, signers } = await loadFixture(deploySwitchboardFixture);

//   const switchboard = new SwitchboardProgram(sb);

//   const queueAuthority = signers.shift()!;

//   const [queueAccount] = await OracleQueueAccount.create(
//     switchboard.connect(queueAuthority),
//     {
//       name: "Queue1",
//       authority: queueAuthority.address,
//       unpermissionedFeedsEnabled: false,
//       maxSize: 32,
//       reward: 0,
//       oracleTimeout: 180,
//     }
//   );

//   const oracles: Record<number, OracleAccount> = {};

//   for (const n of Array.from({ length: 5 }, (_, i) => i + 1)) {
//     debugLogging(`Creating oracle #${n}`);
//     const oracleAuthority = signers.shift()!;

//     // uses queueAuthority as the signer to enable permissions correctly
//     let [oracleAccount] = await queueAccount.createOracle(
//       { name: `Oracle-${n}`, authority: oracleAuthority.address },
//       true
//     );

//     // override oracle signer so we can avoid passing around oracleAuthority signer
//     oracleAccount = new OracleAccount(
//       switchboard.connect(oracleAuthority),
//       oracleAccount.address
//     );

//     oracles[n] = oracleAccount;
//   }

//   await Promise.all(Object.values(oracles).map((o) => o.heartbeat()));

//   debugLogging(`Oracles finished heartbeating`);

//   return {
//     switchboard,
//     sb,
//     owner,
//     signers,
//     queueAccount,
//     oracles: oracles as {
//       1: OracleAccount;
//       2: OracleAccount;
//       3: OracleAccount;
//       4: OracleAccount;
//       5: OracleAccount;
//     },
//   };
// }

// export async function deploySwitchboardWithFiveOraclesAndAggregatorFixture(): Promise<
//   SwitchboardWithFiveOraclesFixture & { aggregatorAccount: AggregatorAccount }
// > {
//   // Contracts are deployed using the first signer/account by default
//   // const [owner, queue, oracle, user] = await ethers.getSigners();
//   const { switchboard, sb, owner, signers, queueAccount, oracles } =
//     await loadFixture(deploySwitchboardWithFiveOraclesFixture);

//   const queue = await queueAccount.loadData();

//   const [aggregatorAccount] = await queueAccount.createAggregator({
//     name: "Aggregator-1",
//     batchSize: 5,
//     minOracleResults: 4,
//     minJobResults: 1,
//     minUpdateDelaySeconds: 10,
//     varianceThreshold: 0,
//     forceReportPeriod: 0,
//     jobsHash: "",
//     enableHistory: true,
//     authority: queue.authority, // queue authority is the authority now
//     fundAmount: 0,
//   });

//   return {
//     switchboard,
//     sb,
//     owner,
//     signers,
//     queueAccount,
//     oracles: oracles as {
//       1: OracleAccount;
//       2: OracleAccount;
//       3: OracleAccount;
//       4: OracleAccount;
//       5: OracleAccount;
//     },
//     aggregatorAccount,
//   };
// }
// export async function deploySwitchboardWithQueueAndOracleFixture(): Promise<SwitchboardWithOracleFixture> {
//   // Contracts are deployed using the first signer/account by default
//   // const [owner, queue, oracle, user] = await ethers.getSigners();
//   const { sb, owner, signers } = await loadFixture(deploySwitchboardFixture);

//   const switchboard = new SwitchboardProgram(sb);

//   const [queueAccount] = await OracleQueueAccount.create(switchboard, {
//     name: "Queue1",
//     authority: owner.address,
//     unpermissionedFeedsEnabled: true,
//     maxSize: 32,
//     reward: 0,
//     oracleTimeout: 180,
//   });
//   // const queue = await queueAccount.loadData();

//   const [oracleAccount] = await queueAccount.createOracle();

//   const heartbeatTx = await oracleAccount.heartbeat();

//   return {
//     switchboard: new SwitchboardProgram(sb),
//     sb: sb,
//     owner,
//     signers,
//     queueAccount,
//     oracleAccount,
//   };
// }

// export async function deployContractsFixture(): Promise<ContractsFixture> {
//   // Contracts are deployed using the first signer/account by default
//   const [owner, ...signers] = await ethers.getSigners();

//   // Deploy Verifier Service once - it's upgradeable, too
//   const sbAttestationService = await ethers.getContractFactory(
//     "SwitchboardAttestationService"
//   );
//   const vs = await upgrades.deployProxy(sbAttestationService, []);

//   // Deploy once
//   const Switchboard = await ethers.getContractFactory("Switchboard");
//   const sb = await upgrades.deployProxy(Switchboard, [vs.address]);

//   // get bindings
//   return {
//     switchboard: new SwitchboardProgram(sb as Switchboard),
//     sb: sb as Switchboard,
//     owner: {
//       address: owner.address,
//       signer: owner,
//       // vs: (vs as SwitchboardAttestationService).connect(owner),
//       sb: (sb as Switchboard).connect(owner),
//     },
//     signers,
//   };
// }

// export async function deployAttestationFixture(): Promise<AttestationFixture> {
//   const { sb, owner, signers } = await loadFixture(deployContractsFixture);

//   const queueAuthority = signers.shift()!;
//   const queueAuthorityVs = sb.connect(queueAuthority);

//   const enclaveOwner1 = signers.shift()!;
//   const enclaveOwnerVs1 = sb.connect(enclaveOwner1);

//   const enclaveAuthority1 = signers.shift()!;
//   const enclaveAuthorityVs1 = sb.connect(enclaveAuthority1);

//   let tx: ContractTransaction;

//   const switchboard = new SwitchboardProgram(sb);

//   // AttestationService Initialization

//   // create service queue
//   debugLogging(`Creating AttestationQueue ...`);

//   const [attestationQueue] = await AttestationQueueAccount.create(
//     switchboard,
//     {
//       authority: queueAuthority.address,
//       maxSize: 180,
//       reward: 0,
//       enclaveTimeout: 3000000,
//       maxEnclaveVerificationAge: 604800,
//       allowAuthorityOverrideAfter: 1,
//       requireAuthorityHeartbeatPermission: false,
//       requireUsagePermissions: false,
//       maxConsecutiveFunctionFailures: 1,
//     },
//     { simulate: false }
//   );
//   debugLogging(`  - address: ${attestationQueue.address}`);

//   const attestationQueueData = await attestationQueue.loadData();
//   debugLogging(`  - authority: ${queueAuthority.address}`);
//   // create a enclave
//   debugLogging(`Creating Enclave #1 ...`);
//   const enclave1 = await attestationQueue.createEnclave({
//     authority: enclaveAuthority1.address,
//     signer: enclaveOwner1.address,
//   });
//   debugLogging(`  - address: ${enclave1.address}`);
//   const enclaveData = await enclave1.loadData();
//   // set enclave permissions for fun

//   // set heartbeat permissions
//   debugLogging(`  - setting permissions ...`);
//   tx = await Permissions.setAttestationPermissions(
//     switchboard,
//     attestationQueue.address,
//     enclave1.address,
//     PermissionStatus.PERMIT_ATTESTATION_QUEUE_USAGE,
//     true,
//     { signer: queueAuthority }
//   );
//   await tx.wait();

//   // put 'enclave' on chain
//   const enclaveBuffer = Array.from(new Uint8Array(enclaveVerifierMrEnclave));
//   debugLogging(`  - setting enclave buffer ...`);
//   tx = await enclaveAuthorityVs1.updateEnclave(enclave1.address, enclaveBuffer);
//   tx.wait();

//   // set usage permissions - try to ovrride verification so we can heartbeat
//   debugLogging(`  - force overriding ...`);
//   tx = await sendTxnWithOptions(
//     queueAuthorityVs,
//     "forceOverrideVerify",
//     [enclave1.address],
//     { gasFactor: 2 }
//   );
//   tx.wait();

//   // heartbeat
//   debugLogging(`  - heartbeating ...`);
//   tx = await enclaveAuthorityVs1.enclaveHeartbeat(enclave1.address);
//   tx.wait();

//   // check that heartbeat worked
//   const enclave = await sb.enclaves(enclave1.address);
//   expect(enclave.lastHeartbeat).to.be.greaterThan(0);

//   return {
//     switchboard: new SwitchboardProgram(sb as Switchboard),
//     sb,
//     owner,
//     signers,
//     attestationQueue: {
//       address: attestationQueue.address,
//       authority: {
//         address: queueAuthority.address,
//         signer: queueAuthority,
//       },
//       enclaves: [
//         {
//           address: enclave1.address,
//           owner: {
//             address: enclaveOwner1.address,
//             signer: enclaveOwner1,
//           },
//           authority: {
//             address: enclaveAuthority1.address,
//             signer: enclaveAuthority1,
//           },
//         },
//       ],
//     },
//   };
// }
