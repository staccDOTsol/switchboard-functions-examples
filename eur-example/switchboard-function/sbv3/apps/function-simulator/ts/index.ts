export const SIMULATION_SERVER_URL: string = "wss://functions.switchboard.xyz";

/**
 * Get the MrEnclave measurement for a given container.
 * @param container - The name of the container to retrieve the MrEnclave value for.
 * @param version - Optional. The version of the container to retrieve the MrEnclave value for.
 * @param containerRegistry - Optional. The container registry to use for the container.
 * @returns A Promise that resolves to the MrEnclave value for the specified container.
 * @throws An error if the HTTP response status is not ok.
 */
export async function getMrEnclave(
  container: string,
  version?: string,
  containerRegistry?: string
): Promise<string> {
  const msg: MsgInMeasurementData = { container, containerRegistry, version };
  const response = await fetch(`https://functions.switchboard.xyz/mrenclave`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(msg),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`);
  }

  const data: MsgOutMeasurementData = await response.json();

  return data.mrEnclave;
}

/** ECHO */
export type MsgInEchoData = {
  message: string;
};
export type MsgInEcho = { event: "echo" } & { data: MsgInEchoData };
export type MsgOutEchoData = {
  message: string;
};
export type MsgOutEcho = { event: "echo" } & { data: MsgOutEchoData };

/** CONTAINER_VERIFY */
export type MsgInContainerVerifyData = {
  containerRegistry?: string;
  container: string;
  version?: string;
};
export type MsgInContainerVerify = {
  event: "containerVerify";
} & { data: MsgInContainerVerifyData };
export type MsgOutContainerVerifyData = {
  containerRegistry: string;
  container: string;
  version: string;
  isValid: boolean;
};
export type MsgOutContainerVerify = {
  event: "containerVerify";
} & { data: MsgOutContainerVerifyData };

/** MEASUREMENT */
export type MsgInMeasurementData = {
  containerRegistry?: string;
  container: string;
  version?: string;
};
export type MsgInMeasurement = {
  event: "measurement";
} & { data: MsgInMeasurementData };
export type MsgOutMeasurementData = {
  containerRegistry: string;
  container: string;
  version: string;
  mrEnclave: string;
};
export type MsgOutMeasurement = {
  event: "measurement";
} & { data: MsgOutMeasurementData };

/** SOLANA_SIMULATE */
export type SolanaSimulateParams = {
  container?: string;
  containerRegistry?: string;
  version?: string;
  fnData?: string;
  fnRequestKey?: string;
  fnRequestData?: string;
  payer?: string;
  verifier?: string;
  rewardReceiver?: string;
  queueAuthority?: string;
  verifierEnclaveSigner?: string;
};
export type MsgInSolanaSimulateData = {
  fnKey: string;
  cluster?: "Mainnet" | "Devnet";
  params?: SolanaSimulateParams;
};
export type MsgInSolanaSimulate = {
  event: "solanaSimulate";
} & { data: MsgInSolanaSimulateData };
export type MsgOutSolanaSimulateData = {
  fnKey: string;
  imageName: string;
  result?: string;
  error?: string;
  logs?: string[];
};
export type MsgOutSolanaSimulate = {
  event: "solanaSimulate";
} & { data: MsgOutSolanaSimulateData };

export type MsgInData =
  | MsgInEchoData
  | MsgInContainerVerifyData
  | MsgInMeasurementData
  | MsgInSolanaSimulateData;

export type MsgIn =
  | MsgInEcho
  | MsgInContainerVerify
  | MsgInMeasurement
  | MsgInSolanaSimulate;

export type MsgOutData =
  | MsgOutEchoData
  | MsgOutContainerVerifyData
  | MsgOutMeasurementData
  | MsgOutSolanaSimulateData;

export type MsgOut =
  | MsgOutEcho
  | MsgOutContainerVerify
  | MsgOutMeasurement
  | MsgOutSolanaSimulate;

// export class FunctionSimulator {
//   private readonly filters = new Map<string, Array<(data: string) => void>>();
//   constructor(readonly ws: WebSocket) {}

//   onmessage = (event: MessageEvent) => {};

//   public static connect(url?: string): FunctionSimulator {
//     return new FunctionSimulator(new WebSocket(url ?? SIMULATION_SERVER_IP));
//   }

//   private add(id: string, filter: (data: string) => void) {
//     const filters = this.filters.has(id) ? this.filters.get(id)! : [];
//     filters.push(filter);
//     this.filters.set(id, filters);
//   }

//   private remove(id: string, filter: (data: string) => void) {
//     const filters = this.filters.has(id) ? this.filters.get(id)! : [];
//     for (const [i, f] of filters.entries()) {
//       if (f === filter) {
//         this.filters.set(id, [...filters.slice(0, i), ...filters.slice(i + 1)]);
//         return;
//       }
//     }
//   }

//   // public async echo(message?: string): Promise<MsgOutEchoData> {
//   //   const data: MsgInEcho = {
//   //     event: "echo",
//   //     message: message ?? "echo",
//   //   };

//   //   this.ws.send();
//   // }
// }
