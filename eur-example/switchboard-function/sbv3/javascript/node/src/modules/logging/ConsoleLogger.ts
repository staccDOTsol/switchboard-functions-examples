import { extractBooleanEnvVar } from "../../utils/env.js";

import type { INodeLogger } from "./types.js";

export class ConsoleLogger implements INodeLogger {
  private static instance: ConsoleLogger;

  public static getInstance(): ConsoleLogger {
    if (!ConsoleLogger.instance) {
      ConsoleLogger.instance = new ConsoleLogger();
    }

    return ConsoleLogger.instance;
  }

  enabled = true;

  disable() {
    this.enabled = false;
  }

  env(key: string, value: string) {
    if (this.enabled) {
      console.info(`${key.toUpperCase()}: ${value}`);
    }
  }

  log(message: string, id = "") {
    if (this.enabled) {
      console.log(message);
    }
  }

  debug(message: string, id = "") {
    if (this.enabled && !extractBooleanEnvVar("DISABLE_LOGGER_DEBUG")) {
      console.debug(message);
    }
  }

  info(message: string, id = "") {
    if (this.enabled && !extractBooleanEnvVar("DISABLE_LOGGER_INFO")) {
      console.info(message);
    }
  }

  warn(message: string, id = "") {
    if (this.enabled && !extractBooleanEnvVar("DISABLE_LOGGER_WARN")) {
      console.warn(message);
    }
  }

  error(message: string, id = "") {
    if (this.enabled && !extractBooleanEnvVar("DISABLE_LOGGER_ERROR")) {
      console.error(message);
    }
  }

  // https://en.wikipedia.org/wiki/ANSI_escape_code
  public static green(message: string) {
    console.log("\x1b[32m%s\x1b[0m", message);
  }
  public static yellow(message: string) {
    console.log("\x1b[33m%s\x1b[0m", message);
  }
  public static red(message: string) {
    console.log("\x1b[31m%s\x1b[0m", message);
  }
}
