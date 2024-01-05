import { NodeLogger } from "../logging/index.js";

import type { INodePager, Severity } from "./types.js";

import { IncomingWebhook } from "@slack/webhook";

export class SlackPager implements INodePager {
  private static instance: SlackPager;

  public static getInstance(): SlackPager | undefined {
    if (!SlackPager.instance) {
      if (process.env.SLACK_WEBHOOK_URL) {
        const webhook = new IncomingWebhook(process.env.SLACK_WEBHOOK_URL);
        SlackPager.instance = new SlackPager(webhook);
      }
    }

    return SlackPager.instance;
  }

  private constructor(readonly slack: IncomingWebhook) {}

  public async sendEvent(
    severity: Severity,
    summary: string,
    customDetails: Record<string, any> = {}
  ): Promise<void> {
    const url = customDetails.url
      ? `<${customDetails.url}|Explorer>`
      : undefined;
    const timestamp = customDetails.timestamp
      ? `_${customDetails.timestamp}_`
      : "";

    const alerts = severity === "critical" ? "<!channel>" : "";

    const details = {
      ...customDetails,
      ...(customDetails?.meta ?? undefined),
      event: undefined,
      url: undefined,
      timestamp: undefined,
      meta: undefined,
    };

    const headerBlock = {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*[${severity.toUpperCase()}]*${
          "event" in customDetails ? " " + customDetails.event : ""
        }${alerts ? " " + alerts : ""}\n${summary}${url ? "\n" + url : ""}${
          timestamp ? "\n" + timestamp : ""
        }`,
      },
    };

    const blocks =
      Object.values(details).filter((value) => Boolean(value)).length === 0
        ? [headerBlock]
        : [
            headerBlock,
            {
              type: "divider",
            },
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: Object.entries(details)
                  .filter(([key, value]) => value !== undefined)
                  .map(
                    ([key, value]) =>
                      `• *${key}*: ${
                        typeof value === "object"
                          ? JSON.stringify(value)
                          : value
                      }`
                  )
                  .join("\n"),
              },
            },
          ];

    const message = {
      text: `[${severity.toUpperCase()}]: ${summary}`,
      blocks: blocks,
      channel: process.env.SLACK_CHANNEL ?? "#alerts-solana-devnet",
    };

    try {
      const response = await this.slack.send(message as any);

      // console.log("Alert sent to Slack channel #alerts-solana-devnet");
    } catch (error) {
      NodeLogger.getInstance().error(`Failed to send slack alert, ${error}`);
    }

    // // Define the event message
    // const event = {
    //   text: "A new event has occurred!",
    //   channel: "#general",
    //   username: "Event Notifier",
    // };

    // // Send the event message to the Slack channel
    // this.slack.webhook(event, (err, response) => {
    //   if (err) {
    //     console.log("Error:", err);
    //   } else {
    //     console.log("Event message sent to Slack channel");
    //   }
    // });
  }
}
