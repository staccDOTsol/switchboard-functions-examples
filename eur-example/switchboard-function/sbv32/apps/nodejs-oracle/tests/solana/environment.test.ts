import { Keypair } from "@solana/web3.js";
// import { SolanaEnvironment } from "../../src/chains/solana/environment";

describe("solana environment tests", () => {
  const env = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...env };
  });

  afterEach(() => {
    process.env = env;
  });

  it("solana devnet oracle fallsback to genesys go mainnet connection if BACKUP_MAINNET_RPC is not set", () => {
    process.env.CLUSTER = "devnet";
    process.env.ORACLE_KEY = Keypair.generate().publicKey.toString();
    process.env.RPC_URL = "https://devnet.genesysgo.net";
    // const solanaEnv = SolanaEnvironment.getInstance();
    // // if (
    // //   solanaEnv.mainnetConnection.rpcEndpoint !==
    // //   "https://api.mainnet-beta.solana.com"
    // // ) {
    // //   throw new Error(
    // //     `Solana devnet oracle should use mainnet genesys go endpoint if BACKUP_MAINNET_RPC is not provided`
    // //   );
    // // }
  });
});
