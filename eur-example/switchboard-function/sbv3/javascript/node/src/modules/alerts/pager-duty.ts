// import { NodeEnvironment } from "../../env/NodeEnvironment";
import { NodeLogger } from "../logging/index.js";

import type { INodePager, Severity } from "./types.js";

import { event } from "@pagerduty/pdjs";
import dotenv from "dotenv";
import os from "os";
dotenv.config();

export type CustomPagerDutyDetails = Record<string, any> & {
  group?: string;
};

export class PagerDuty implements INodePager {
  private static instance: PagerDuty;

  public static getInstance(): PagerDuty {
    if (!PagerDuty.instance) {
      PagerDuty.instance = new PagerDuty();
    }

    return PagerDuty.instance;
  }

  private constructor() {}

  public async sendEvent(
    severity: Severity,
    summary: string,
    customDetails: CustomPagerDutyDetails = {}
  ): Promise<void> {
    try {
      const routingKey = process.env.PAGERDUTY_EVENT_KEY ?? "";
      if (routingKey.length === 0) {
        NodeLogger.getInstance().log(
          `$PAGERDUTY_EVENT_KEY missing, skipping alert`
        );
        return;
      }

      await event({
        server: process.env.PAGERDUTY_SERVER ?? "events.pagerduty.com",
        data: {
          routing_key: routingKey,
          event_action: "trigger",
          payload: {
            summary: summary,
            timestamp: new Date().toISOString(),
            source: os.hostname(),
            severity: severity,
            group: customDetails.group ?? "",
            custom_details: {
              ...customDetails,
              source: os.hostname(),
              client: os.hostname(),
            },
          },
        },
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error();
          }
        })
        .catch((error) => {
          NodeLogger.getInstance().debug(
            `Failed to send pager duty alert: ${error}`,
            "Pager"
          );
        });
    } catch (error) {}
  }
}
