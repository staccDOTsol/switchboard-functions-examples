import {
  AttestationQueueAccount,
  FunctionAccount,
  getSwitchboardPushReceiver,
  SwitchboardProgram,
} from "@switchboard-xyz/evm.js";
import { ethers } from "hardhat";

async function main() {
  const [deployer, newAuthoritySigner] = await ethers.getSigners();

  const diamondAddress =
    process.env.SWITCHBOARD_ADDRESS ?? process.env.DIAMOND_ADDRESS ?? "";
  const queueId = process.env.QUEUE_ID ?? "";
  const newAuthority = process.env.NEW_AUTHORITY ?? "";
  const pushReceiverAddress = process.env.PUSH_RECEIVER_ADDRESS ?? "";

  if (!diamondAddress) {
    throw new Error(
      "Please set the diamond address with: export SWITCHBOARD_ADDRESS=..."
    );
  }

  if (!queueId) {
    throw new Error("Please set the queueid with: export QUEUE_ID=...");
  }

  // Just a secondary check to make sure we don't accidentally overwrite the authority with an account we don't have access to
  if (!newAuthority) {
    throw new Error(
      "Please set the new authority with: export NEW_AUTHORITY=..."
    );
  }

  // Rotate push receiver authority too
  if (!pushReceiverAddress) {
    throw new Error(
      "Please set the push receiver address with: export PUSH_RECEIVER_ADDRESS=..."
    );
  }

  // check that newAuthoritySigner is equal to newAuthority
  if (newAuthoritySigner.address !== newAuthority) {
    throw new Error(
      "The new authority signer address does not match the new authority address"
    );
  }

  console.log("Account:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());
  const switchboardProgram = await SwitchboardProgram.load(
    deployer,
    diamondAddress
  );

  const queue = new AttestationQueueAccount(switchboardProgram, queueId);
  const queueData = await queue.loadData();

  //===========================================================================
  // Add New Authority as Admin
  //===========================================================================

  // Make the new authority an admin on the ACL list (not an owner yet)
  let tx = await switchboardProgram.sb.setAdmin(newAuthority, true);

  // WAIT FOR TX
  let receipt = await tx.wait();
  console.log("SET ADMIN RECEIPT", receipt);

  //===========================================================================
  // Rotate the queue authority
  //===========================================================================

  // update the queue authority
  tx = await switchboardProgram.sb.setAttestationQueueConfig(
    queueId,
    newAuthority, // <---------------------------------------- account rotation
    queueData.maxSize,
    queueData.reward,
    queueData.enclaveTimeout,
    queueData.maxEnclaveVerificationAge,
    queueData.allowAuthorityOverrideAfter,
    queueData.requireAuthorityHeartbeatPermission,
    queueData.requireUsagePermissions,
    queueData.maxConsecutiveFunctionFailures
  );

  // WAIT FOR TX
  receipt = await tx.wait();
  console.log("ROTATE ATTESTATION QUEUE RECEIPT", receipt);

  //===========================================================================
  // Add New Authority as Admin in Push Receiver
  //===========================================================================

  // Get Switchboard Push Receiver
  const switchboardPushReceiver = getSwitchboardPushReceiver(
    pushReceiverAddress,
    deployer
  );

  // Make the new authority an admin on the ACL list (not an owner yet)
  tx = await switchboardPushReceiver.setAdmin(newAuthority, true);

  // WAIT FOR TX
  receipt = await tx.wait();
  console.log("SET ADMIN RECEIPT", receipt);

  //===========================================================================
  // Set Push Receiver Owner
  //===========================================================================

  // Set the push receiver owner to the new authority
  tx = await switchboardPushReceiver.transferOwnership(newAuthority);

  // WAIT FOR TX
  receipt = await tx.wait();
  console.log("SET PUSH RECEIVER OWNER RECEIPT", receipt);

  //===========================================================================
  // Rotate Authority of Push Receiver function
  //===========================================================================

  const switchboardPushFunctionId = await switchboardPushReceiver.functionId();
  const fn = new FunctionAccount(switchboardProgram, switchboardPushFunctionId);
  const fnData = await fn.loadData();

  // update the push function authority
  tx = await switchboardProgram.sb.setFunctionConfig(
    switchboardPushFunctionId,
    fnData.name,
    newAuthority, // <---------------------------------------- account rotation
    fnData.config.containerRegistry,
    fnData.config.container,
    fnData.config.version,
    fnData.config.schedule,
    fnData.config.paramsSchema,
    fnData.config.permittedCallers
  );

  // WAIT FOR TX
  receipt = await tx.wait();
  console.log("ROTATE PUSH FUNCTION RECEIPT", receipt);

  //===========================================================================
  // Change the owner of the Switchboard Diamond
  //===========================================================================
  tx = await switchboardProgram.sb.transferOwnership(newAuthority);

  // WAIT FOR TX
  receipt = await tx.wait();
  console.log("SET DIAMOND OWNER RECEIPT", receipt);
}

main();
