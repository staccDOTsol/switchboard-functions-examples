import {
  AttestationQueueAccount,
  EnclaveAccount,
  FunctionAccount,
  Permissions,
  SwitchboardProgram,
  // eslint-disable-next-line node/no-extraneous-import
} from "@switchboard-xyz/evm.js";
import { ethers } from "hardhat";

async function main() {
  const fees = await ethers.provider.getFeeData();
  const [deployer] = await ethers.getSigners();
  const SWITCHBOARD_ADDRESS = process.env.DIAMOND_ADDRESS ?? "";
  console.log("Account:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());
  const switchboardProgram = await SwitchboardProgram.load(
    deployer,
    SWITCHBOARD_ADDRESS
  );

  // Create an Attestation Queue
  const [queue, createQueueTx] = await AttestationQueueAccount.create(
    switchboardProgram,
    {
      authority: deployer.address,
      maxSize: 1000,
      reward: 0,
      enclaveTimeout: 180,
      maxEnclaveVerificationAge: 604800,
      allowAuthorityOverrideAfter: 1,
      requireAuthorityHeartbeatPermission: true,
      requireUsagePermissions: false,
      maxConsecutiveFunctionFailures: 10,
    },
    { gasPrice: fees.gasPrice.mul(1) }
  );

  console.log(
    `Queue create signature: ${
      (await createQueueTx.wait()).logs[0].transactionHash
    }`
  );
  console.log(`Queue address: ${queue.address}`);

  // Create a Function Account
  // const [func, createFuncTx] = await FunctionAccount.create(
  // switchboardProgram,
  // {
  // authority: deployer.address,
  // attestationQueue: queue.address,
  // name: "MITCH_FUNCTION",
  // containerRegistry: "dockerhub",
  // container: "switchboardlabs/evm-randomness-function",
  // schedule: "30 * * * * *",
  // version: "latest",
  // },
  // {
  // // fund the account with 0.01 ether
  // value: ethers.utils.parseEther("0.01"),
  // }
  // );
  // console.log(
  // `Function create signature: ${
  // (await createFuncTx.wait()).logs[0].transactionHash
  // }`
  // );
  // console.log(`Function address: ${func.address}`);

  // Create the Enclave Account
  const [enclave, createEnclaveTx] = await EnclaveAccount.create(
    switchboardProgram,
    {
      attestationQueue: queue.address,
      authority: deployer.address,
      signer: deployer.address,
    },
    { gasPrice: fees.gasPrice.mul(1) }
  );
  console.log(
    `Enclave create signature: ${
      (await createEnclaveTx.wait()).logs[0].transactionHash
    }`
  );
  console.log(`Enclave address: ${enclave.address}`);

  // Set heartbeat permission to "on" for the enclave
  const permissionSetTx = await Permissions.set(
    switchboardProgram,
    queue,
    enclave.address,
    1,
    true
  );
  console.log(
    `Permission signature: ${
      (await permissionSetTx.wait()).logs[0].transactionHash
    }`
  );

  // Force override verify the enclave so it can heartbeat
  const forceOverrideTx = await enclave.forceOverrideVerify({
    gasPrice: fees.gasPrice.mul(1),
  });
  console.log(
    `Enclave forceOverride signature: ${
      (await forceOverrideTx.wait()).logs[0].transactionHash
    }`
  );

  // Heartbeat Enclave - though this should be undone by the qvn
  const heartbeatTx = await enclave.heartbeat({
    gasPrice: fees.gasPrice.mul(1),
  });
  console.log(
    `Enclave heartbeat signature: ${(await heartbeatTx.wait()).transactionHash}`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
