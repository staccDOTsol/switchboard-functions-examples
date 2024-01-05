import { Port } from "@port.finance/port-sdk";
import type { Connection, PublicKey } from "@solana/web3.js";
import type { Big } from "@switchboard-xyz/common";

export class PortClient {
  public readonly port: Port;

  constructor(mainnetConnection: Connection) {
    this.port = Port.forMainNet({ connection: mainnetConnection });
  }

  /** Calculate the price for a given port lp token */
  public async getLpExchangeRate(reserveKey: PublicKey): Promise<Big> {
    try {
      const reserveInfo = await this.port.getReserve(reserveKey);
      const totalLiquidity = reserveInfo.getTotalAsset().getRaw();
      const mintTotalSupply =
        reserveInfo.proto.collateral.mintTotalSupply.getRaw();
      return mintTotalSupply.div(totalLiquidity);
    } catch (error) {
      throw new Error(`failed to load port ${error}`);
    }
  }
}
