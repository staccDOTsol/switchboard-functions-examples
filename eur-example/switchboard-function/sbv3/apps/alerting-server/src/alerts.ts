import { NodeLogger } from "@switchboard-xyz/node/logging";

export type AlertEntry = {
  name: string;
  chain: string;
  threshold: string;
};

export type IAlerts = {
  alerts: Array<AlertEntry>;
};

export class AlertsProvider {
  private static instance: AlertsProvider;

  private data: IAlerts = { alerts: [] };

  private constructor() {}

  public static getInstance(): AlertsProvider {
    if (!AlertsProvider.instance) {
      AlertsProvider.instance = new AlertsProvider();
    }

    return AlertsProvider.instance;
  }

  public addAlert(alert: AlertEntry) {
    for (const a of this.data.alerts) {
      if (a.name === alert.name) {
        NodeLogger.getInstance().info(`Alert already exists ${alert.name}`);
        return;
      }
    }

    this.data.alerts.push(alert);
  }
}
