import { event } from "@pagerduty/pdjs";

export class Pager {
  pdKey: string;
  summary: string;
  chain: string;
  network: string;
  constructor(pdKey: string, summary: string, chain: string, network: string) {
    this.pdKey = pdKey;
    this.summary = summary;
    this.chain = chain;
    this.network = network;
  }
  async sendPage(details: any) {
    console.log(
      `sending page for ${this.chain}-${this.network}:\n${JSON.stringify(
        details
      )}`
    );
    event({
      data: {
        routing_key: this.pdKey,
        event_action: "trigger",
        dedup_key: this.chain + ":" + this.network + ":" + Date.now(),
        payload: {
          summary: this.summary,
          custom_details: details,
          source: this.chain + ":" + this.network,
          severity: "error",
        },
      },
    })
      .then(console.log)
      .catch(console.error);
  }
}
