const ethers = require("ethers");
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";

// Derive wallet from mnemonic
const mnemonic = "your mnemonic here";
const wallet = ethers.Wallet.fromMnemonic(mnemonic);

// Connect to provider
const provider = ethers.getDefaultProvider("homestead");
const walletConnected = wallet.connect(provider);

// Set the transaction details
const tx = {
  to: "address to send to",
  value: ethers.utils.parseEther("1.0"),
};

// Send the transaction
walletConnected.sendTransaction(tx).then((txResponse: any) => {
  console.log(txResponse);
});
