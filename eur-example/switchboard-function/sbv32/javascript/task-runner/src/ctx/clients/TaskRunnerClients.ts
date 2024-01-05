import * as clients from "../../clients/index.js";
import type {
  ITaskRunnerClients,
  ITaskRunnerLogger,
} from "../../types/types.js";

import { Marinade, MarinadeConfig } from "@marinade.finance/marinade-ts-sdk";
import { Connection } from "@solana/web3.js";
import * as RateObserver from "@switchboard-xyz/defi-yield-ts";
import type * as sbv2 from "@switchboard-xyz/solana.js";

export class TaskRunnerClients implements ITaskRunnerClients {
  solanaMainnetConnection: Connection;

  _switchboard?: clients.SwitchboardClient = undefined;
  _saber?: clients.SaberSwap = undefined;
  _orca?: clients.OrcaExchange = undefined;
  _serum?: clients.SerumSwap = undefined;
  _raydium?: clients.RaydiumExchange = undefined;
  _mercurial?: clients.MercurialSwap = undefined;
  _lendingRateObserver?: RateObserver.RateObserver = undefined;
  _mango?: clients.MangoPerps = undefined;
  _jupiter?: clients.JupiterSwap = undefined;
  _pyth?: clients.PythClient = undefined;
  _chainlink?: clients.ChainlinkClient = undefined;
  _marinade?: Marinade = undefined;
  _port?: clients.PortClient = undefined;

  constructor(
    readonly program: sbv2.SwitchboardProgram,
    solanaMainnetConnection: string | Connection,
    private readonly _jupiterApiKey: string | undefined,
    readonly logger: ITaskRunnerLogger = console
  ) {
    this.solanaMainnetConnection =
      typeof solanaMainnetConnection === "string"
        ? new Connection(solanaMainnetConnection, {
            commitment: "confirmed", // TODO: Make configurable
          })
        : solanaMainnetConnection;
  }

  async load(
    retryCount = 2,
    loadRaydium = true
    // loadJupiter = true
    // loadSaber = true
  ) {
    try {
      const promises: Promise<any>[] = [];
      if (loadRaydium) {
        promises.push(this.raydium.load(retryCount));
      }
      // if (loadJupiter) {
      //   promises.push(this.jupiter.load(retryCount));
      // }
      // if (loadSaber) {
      //   promises.push(this.saber.load(retryCount));
      // }
      await Promise.all(promises);
    } catch (error) {
      this.logger.error(
        `TaskRunnerClientError: failed to load clients, ${error}`
      );
    }
  }

  get switchboard(): clients.SwitchboardClient {
    if (this._switchboard === undefined) {
      this._switchboard = new clients.SwitchboardClient(this.program);
    }
    return this._switchboard;
  }

  get saber(): clients.SaberSwap {
    if (this._saber === undefined) {
      this._saber = new clients.SaberSwap(this.solanaMainnetConnection);
    }
    return this._saber;
  }

  get orca(): clients.OrcaExchange {
    if (this._orca === undefined) {
      this._orca = new clients.OrcaExchange(this.solanaMainnetConnection);
    }
    return this._orca;
  }

  get serum(): clients.SerumSwap {
    if (this._serum === undefined) {
      this._serum = new clients.SerumSwap(this.solanaMainnetConnection);
    }
    return this._serum;
  }

  get raydium(): clients.RaydiumExchange {
    if (this._raydium === undefined) {
      this._raydium = new clients.RaydiumExchange(this.solanaMainnetConnection);
    }
    return this._raydium;
  }

  get mercurial(): clients.MercurialSwap {
    if (this._mercurial === undefined) {
      this._mercurial = new clients.MercurialSwap(this.solanaMainnetConnection);
    }
    return this._mercurial;
  }

  get lendingRateObserver(): RateObserver.RateObserver {
    if (this._lendingRateObserver === undefined) {
      this._lendingRateObserver = new RateObserver.RateObserver();
    }
    return this._lendingRateObserver;
  }

  get mango(): clients.MangoPerps {
    if (this._mango === undefined) {
      this._mango = new clients.MangoPerps(this.solanaMainnetConnection);
    }
    return this._mango;
  }

  get jupiter(): clients.JupiterSwap {
    if (this._jupiter === undefined) {
      this._jupiter = new clients.JupiterSwap(
        this.solanaMainnetConnection,
        this._jupiterApiKey
      );
    }
    return this._jupiter;
  }

  get pyth(): clients.PythClient {
    if (this._pyth === undefined) {
      this._pyth = new clients.PythClient(this.solanaMainnetConnection);
    }
    return this._pyth;
  }

  get chainlink(): clients.ChainlinkClient {
    if (this._chainlink === undefined) {
      this._chainlink = new clients.ChainlinkClient(
        this.solanaMainnetConnection
      );
    }
    return this._chainlink;
  }

  get marinade(): Marinade {
    if (this._marinade === undefined) {
      this._marinade = new Marinade(
        new MarinadeConfig({
          connection: this.solanaMainnetConnection,
        })
      );
    }
    return this._marinade;
  }

  get port(): clients.PortClient {
    if (this._port === undefined) {
      this._port = new clients.PortClient(this.solanaMainnetConnection);
    }
    return this._port;
  }
}
