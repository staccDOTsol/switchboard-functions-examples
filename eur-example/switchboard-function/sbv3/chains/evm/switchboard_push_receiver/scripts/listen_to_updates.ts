import { ethers } from "hardhat";

async function main() {
  const sbPushAddress = process.env.SWITCHBOARD_PUSH_ADDRESS ?? "";

  if (!sbPushAddress) {
    throw new Error(
      "Please set the diamond address with: export SWITCHBOARD_PUSH_ADDRESS=..."
    );
  }

  let logCount = 0;
  let lastLog = 0;

  const push = await ethers.getContractAt("Receiver", sbPushAddress);
  const p = await push.deployed();

  const feeds = await p.getAllFeeds();
  console.log(feeds);
  feeds.map((feed) => {
    const feedName = ethers.utils.parseBytes32String(feed.feedName);
    console.log(
      feedName,
      feed.feedId.toString(),
      feed.latestResult.value.toString()
    );
  });

  const eventLib = await ethers.getContractAt("EventLib", sbPushAddress);

  // listen to contract feed update events
  p.on(eventLib.filters.NewResult(), (e) => {
    lastLog = Date.now();
    console.log(`${logCount} new result: `, e);
    logCount++;
  });

  // await forever
  await new Promise(() => {});
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
