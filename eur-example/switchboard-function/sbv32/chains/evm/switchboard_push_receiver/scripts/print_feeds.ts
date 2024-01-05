import { ethers } from "hardhat";
import moment from "moment-timezone";

async function main() {
  const sbPushAddress = process.env.SWITCHBOARD_PUSH_ADDRESS ?? "";

  const divisor = ethers.BigNumber.from("1000000000000000000");

  if (!sbPushAddress) {
    throw new Error(
      "Please set the diamond address with: export SWITCHBOARD_PUSH_ADDRESS=..."
    );
  }

  const push = await ethers.getContractAt("Receiver", sbPushAddress);
  const p = await push.deployed();

  const feeds = await p.getAllFeeds();
  console.log(feeds);

  feeds.map((feed: any) => {
    const feedName = ethers.utils.parseBytes32String(feed.feedName);
    console.log(
      feedName,
      feed.feedId.toString(),
      ethers.BigNumber.from(feed.latestResult.value.toString())
        .div(divisor)
        .toString(),
      moment(new Date(feed.latestResult.updatedAt.toNumber() * 1000))
        .tz("America/New_York")
        .format("YYYY-MM-DD HH:mm:ss")
    );
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
