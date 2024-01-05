import { NodeLogger } from "../logging/index.js";

import type { INodePager, Severity } from "./types.js";

import type { Snowflake, TextChannel } from "discord.js";
import { Client, GatewayIntentBits } from "discord.js";

export class DiscordPager implements INodePager {
  private static instance: DiscordPager;
  private static webtoken: string;
  private static channel: Snowflake;
  public Client: Client;
  public static getInstance(): DiscordPager | undefined {
    if (!DiscordPager.instance) {
      if (process.env.DISCORD_WEBTOKEN && process.env.DISCORD_CHANNEL) {
        const webtoken = process.env.DISCORD_WEBTOKEN;
        const channel = process.env.DISCORD_CHANNEL;
        DiscordPager.instance = new DiscordPager(webtoken, channel);
      }
    }

    return DiscordPager.instance;
  }

  public constructor(readonly webtoken: string, readonly channel: string) {
    this.Client = new Client({
      intents: [
        GatewayIntentBits.GuildWebhooks,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageTyping,
      ],
    });
    this.webtoken = webtoken;
    this.channel = channel;
  }

  public async sendEvent(
    severity: Severity,
    summary: string,
    customDetails: Record<string, any> = {}
  ): Promise<void> {
    await this.Client.login(this.webtoken);
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

    const headerBlock = `>>> *[${severity.toUpperCase()}]*${
      "event" in customDetails ? " " + customDetails.event : ""
    }${alerts ? " " + alerts : ""}\n${summary}${url ? "\n" + url : ""}${
      timestamp ? "\n" + timestamp : ""
    }\n`;

    const blocks =
      Object.values(details).filter((value) => Boolean(value)).length === 0
        ? headerBlock
        : headerBlock +
          Object.entries(details)
            .filter(([key, value]) => value !== undefined)
            .map(
              ([key, value]) =>
                `• *${key}*: ${
                  typeof value === "object" ? JSON.stringify(value) : value
                }`
            )
            .join("\n");

    try {
      const channel = (await this.Client.channels.fetch(
        this.channel
      )) as TextChannel;
      await channel.send({ content: blocks });

      // (this.Client.channels.cache.get(this.channel) as TextChannel).send(blocks)
      NodeLogger.getInstance().info(
        `Alert sent to discord channel ${this.channel}`
      );
    } catch (error) {
      NodeLogger.getInstance().error(`Failed to send discord alert, ${error}`);
    }

    return;
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
