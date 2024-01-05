import { SolanaEnvironment } from "../../../env/SolanaEnvironment";
import type { SolanaOracleProvider } from "../oracle/OracleProvider";

import type { PublicKey } from "@solana/web3.js";
import type { BN } from "@switchboard-xyz/common";
import { sleep } from "@switchboard-xyz/common";
import { SwitchboardEventDispatcher } from "@switchboard-xyz/node";
import { NodeLogger } from "@switchboard-xyz/node/logging";
import type {
  SwitchboardEvents,
  SwitchboardProgram,
} from "@switchboard-xyz/solana.js";
import { types, VrfAccount, VrfLiteAccount } from "@switchboard-xyz/solana.js";
import { execSync } from "child_process";

export class VrfRequestRandomnessEvent extends SwitchboardEventDispatcher {
  eventName: keyof SwitchboardEvents = "VrfRequestRandomnessEvent";
  ws?: number;

  constructor(readonly provider: SolanaOracleProvider) {
    super();
    if (SolanaEnvironment.parseBoolean("SOLANA_EVENT_WATCHER_AUTORECONNECT")) {
      setInterval(async () => {
        await this.restart();
      }, 1 * 60 * 60 * 1000).unref(); // restart open round watcher every 1hr
    }
  }

  async start(): Promise<void> {
    NodeLogger.getInstance().info(
      `Watching event: ${this.eventName} ...`,
      "Oracle"
    );
    this.ws = await this.provider.program.addEventListener(
      "VrfRequestRandomnessEvent",
      this.callback
    );
  }

  async stop(): Promise<void> {
    if (this.ws !== undefined) {
      NodeLogger.getInstance().info(
        `Stopping Event ${this.eventName} ...`,
        "Oracle"
      );
      this.provider.program.removeEventListener(this.ws);
    }
  }

  callback = async (event: SwitchboardEvents["VrfRequestRandomnessEvent"]) => {
    try {
      const oracleIdx = event.oraclePubkeys.findIndex((key) =>
        key.equals(this.provider.oracleAccount.publicKey)
      );
      if (oracleIdx === -1) {
        return;
      }

      this.newEvent();

      NodeLogger.getInstance().debug(
        `VrfRequestRandomnessEvent: event received`,
        event.vrfPubkey.toBase58()
      );

      if (event.alpha.byteLength !== 32) {
        NodeLogger.getInstance().error(
          `VRF Alpha is wrong length, expected 80, received ${event.alpha.byteLength} bytes`,
          event.vrfPubkey.toBase58()
        );
        return;
      }
      const alphaHex = event.alpha.toString("hex");

      // TODO: Pass authority keypair through file descriptor.
      const secretKey = this.provider.payer.secretKey;
      const secretHex = Buffer.from(
        secretKey.slice(0, secretKey.length - 32)
      ).toString("hex");

      let proofHexString: string | null = null;
      try {
        if (SolanaEnvironment.getInstance().SOLANA_DISABLE_ECVRF_BINARY) {
          throw new Error(
            `rust-ecvrf binary disabled with SOLANA_DISABLE_ECVRF_BINARY`
          );
        }
        proofHexString = execSync(
          `rust-ecvrf prove ${secretHex} "${alphaHex}"`,
          {
            encoding: "utf8",
          }
        ).trim();
      } catch (execError) {
        if (SolanaEnvironment.getInstance().DEBUG) {
          NodeLogger.getInstance().error(
            `Failed to generate VRF proof using the rust-ecvrf binary, ${execError}`,
            event.vrfPubkey.toBase58()
          );
        }

        try {
          if (SolanaEnvironment.getInstance().SOLANA_DISABLE_ECVRF_WASM) {
            throw new Error(
              `rust-ecvrf wasm disabled with SOLANA_DISABLE_ECVRF_WASM`
            );
          }
          const ecvrf = await import("@switchboard-xyz/ecvrf-wasm");
          proofHexString = ecvrf.ecvrf_prove(secretHex, alphaHex);
        } catch (wasmError) {
          if (SolanaEnvironment.getInstance().DEBUG) {
            NodeLogger.getInstance().error(
              `Failed to generate VRF proof using the WASM module, ${wasmError}`,
              event.vrfPubkey.toBase58()
            );
          }
        }
      }

      if (!proofHexString) {
        throw new Error(`Failed to generate the VRF proof`);
      }

      const [accountType, vrfAccount, vrf] = await fetchVrfAccountInfo(
        this.provider.program,
        event.vrfPubkey,
        event.counter
      );

      if (vrf.counter.gt(event.counter)) {
        NodeLogger.getInstance().error(
          `VRF counter mismatch, expected ${event.counter.toString()}, received ${vrf.counter.toString()}`,
          vrfAccount.publicKey.toBase58()
        );
        return;
      }

      if (vrf.counter.lt(event.counter)) {
        NodeLogger.getInstance().error(
          `VRF counter mismatch - proceeding (may result in callback mismatch), expected ${event.counter.toString()}, received ${vrf.counter.toString()}`,
          vrfAccount.publicKey.toBase58()
        );
      }

      if (accountType === "Vrf") {
        await this.provider
          .sendVrf(
            vrfAccount as VrfAccount,
            vrf as types.VrfAccountData,
            oracleIdx,
            event.counter,
            proofHexString
          )
          .then((signatures: string[]) => {
            NodeLogger.getInstance().info(
              `VRF: Completed in ${signatures.length} txns`,
              vrfAccount.publicKey.toBase58()
            );

            // stall check
            this.newResponse();
          })
          .catch((error) => {
            NodeLogger.getInstance().error(
              `VRF: Failed to send proveAndVerify txns - ${error}`,
              vrfAccount.publicKey.toBase58()
            );
            if (SolanaEnvironment.VERBOSE()) {
              console.error(error);
            }
          });

        return;
      }

      if (accountType === "VrfLite") {
        await this.provider
          .sendVrfLite(
            vrfAccount as VrfLiteAccount,
            vrf as types.VrfLiteAccountData,
            oracleIdx,
            event.counter,
            proofHexString
          )
          .then((signatures: string[]) => {
            NodeLogger.getInstance().info(
              `VRF: Completed in ${signatures.length} txns`,
              vrfAccount.publicKey.toBase58()
            );

            // stall check
            this.newResponse();
          })
          .catch((error) => {
            NodeLogger.getInstance().error(
              `VRF: Failed to send proveAndVerify txns - ${error}`,
              vrfAccount.publicKey.toBase58()
            );
            if (SolanaEnvironment.VERBOSE()) {
              console.error(error);
            }
          });

        return;
      }
    } catch (error) {
      NodeLogger.getInstance().error(
        `VRF: VrfRequestRandomness event failed - ${error}`,
        event.vrfPubkey.toBase58()
      );
    }
  };
}

/** Fetch and decode a VRF account by a given pubkey */
async function fetchVrfAccountInfo(
  program: SwitchboardProgram,
  vrfPubkey: PublicKey,
  counter: BN,
  retryCount = 5
): Promise<
  | ["Vrf", VrfAccount, types.VrfAccountData]
  | ["VrfLite", VrfLiteAccount, types.VrfLiteAccountData]
> {
  const vrfAccountInfo = await program.connection.getAccountInfo(vrfPubkey);
  if (!vrfAccountInfo) {
    await sleep(1000);
    return fetchVrfAccountInfo(program, vrfPubkey, counter, --retryCount);
  }

  const vrfDiscriminator = vrfAccountInfo.data.slice(0, 8);
  const accountType: "Vrf" | "VrfLite" | undefined =
    Buffer.compare(vrfDiscriminator, types.VrfAccountData.discriminator) === 0
      ? "Vrf"
      : Buffer.compare(
          vrfDiscriminator,
          types.VrfLiteAccountData.discriminator
        ) === 0
      ? "VrfLite"
      : undefined;
  if (!accountType) {
    throw new Error(`Failed to find VRF Account Type - ${vrfPubkey}`);
  }

  const vrf =
    accountType === "Vrf"
      ? types.VrfAccountData.decode(vrfAccountInfo.data)
      : types.VrfLiteAccountData.decode(vrfAccountInfo.data);

  if (vrf.counter.lt(counter)) {
    await sleep(1000);
    return fetchVrfAccountInfo(program, vrfPubkey, counter, --retryCount);
  }

  return "stateBump" in vrf
    ? ["VrfLite", new VrfLiteAccount(program, vrfPubkey), vrf]
    : ["Vrf", new VrfAccount(program, vrfPubkey), vrf];
}
