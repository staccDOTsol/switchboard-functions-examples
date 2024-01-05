import type { INodePager, Severity } from "./types.js";

export class ConsolePager implements INodePager {
  private static instance: ConsolePager;

  public static getInstance(): ConsolePager | undefined {
    if (!ConsolePager.instance) {
      ConsolePager.instance = new ConsolePager();
    }

    return ConsolePager.instance;
  }

  private constructor() {}

  public async sendEvent(
    severity: Severity,
    summary: string,
    customDetails: Record<string, any> = {}
  ): Promise<void> {
    const message = `[${severity.toUpperCase()}]${
      "event" in customDetails ? " " + customDetails.event : ""
    }: ${summary}\n${JSON.stringify(customDetails, undefined, 2)}`;

    switch (severity) {
      case "critical": {
        console.error("\x1b[41;30m‼️ %s\x1b[0m", message); // red background, black text
        break;
      }
      case "error": {
        console.error("\x1b[31m🚫 %s\x1b[0m", message); // red
        break;
      }
      case "warning": {
        console.error("\x1b[33m⚠️ %s\x1b[0m", message); // yellow
        break;
      }
      default: {
        console.error("\x1b[34mℹ️ %s\x1b[0m", message); // blue
        break;
      }
    }
  }
}
