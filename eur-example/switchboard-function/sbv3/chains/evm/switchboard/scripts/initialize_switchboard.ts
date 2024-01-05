import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(
    "Deploying the queue with the account:",
    await deployer.getAddress()
  );

  const SWITCHBOARD_ADDRESS: string = process.env.DIAMOND_ADDRESS!;

  /**
   * CREATE ATTESTATION QUEUE
   */
  console.log("Account balance:", (await deployer.getBalance()).toString());

  const attestationContract = await ethers.getContractAt(
    "AttestationQueue",
    SWITCHBOARD_ADDRESS
  );
  const sw = await attestationContract.deployed();

  console.log("Switchboard address:", sw.address);
  const time = Date.now();
  const tx = await sw.createAttestationQueue(
    deployer.address,
    1000, // max size 1000,
    0, // no reward for permissioned queue
    120, // 2 minute for heartbeat timeout
    60 * 60 * 24 * 7, // 7 days
    1, // allow authority overrides after 1 second
    true, // require authority heartbeat permissions
    false, // don't require usage permissions
    3
  );

  const attestationQueueId = await tx.wait().then((logs) => {
    const log = logs.logs[0];
    const sbLog = attestationContract.interface.parseLog(log);
    return sbLog.args.accountId as string;
  });

  console.log("Attestation Queue created in", Date.now() - time, "ms");
  console.log("Attestation Queue:", attestationQueueId);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
