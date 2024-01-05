import { extractBooleanEnvVar } from "../../utils/env.js";

import type { INodeLogger } from "./types.js";

import { LoggingWinston } from "@google-cloud/logging-winston";
import * as dotenv from "dotenv";
import * as winston from "winston";

dotenv.config();

export class NodeLogger implements INodeLogger {
  private static instance: NodeLogger;

  public static getInstance(): NodeLogger {
    if (!NodeLogger.instance) {
      NodeLogger.instance = new NodeLogger();
    }

    return NodeLogger.instance;
  }

  private _logger: winston.Logger;

  enabled = true;

  get logger() {
    return this._logger;
  }

  private constructor() {
    this._logger = winston.createLogger({
      format: winston.format.combine(
        winston.format.errors({ stack: true }),
        winston.format.timestamp(),
        winston.format.json(),
        winston.format.printf((info: any) => {
          const regex =
            /Error processing Instruction [0-9]+: custom program error: 0x[0-9]+/g;
          const hexregex = /0x[0-9]+/g;
          if (info.message && info.message.search(regex) > -1) {
            try {
              info.errorCode = Number(info.match(hexregex).toString());
            } catch (e) {}
          }
          return info;
        }),
        winston.format.printf((info) => {
          if (info.level === "debug" && info.message.indexOf("\r\n") !== -1) {
            return `${info.message}`;
          }
          const log: any = {
            timestamp: info.timestamp,
            level: info.level,
            id: "id" in info ? info.id : "N/A",
            // service: info.service,
            message: info.message,
          };
          const logStr = JSON.stringify(log);
          if (info.stack) {
            return logStr + "\r\n" + info.stack;
          }
          return logStr;
        })
      ),
      // defaultMeta: { service: "js_node_task_runner" },

      transports: setTransport(),
    });
  }

  disable() {
    this.enabled = false;
  }

  env(key: string, value: string | undefined) {
    if (this.enabled) {
      this.logger.info(`${key.toUpperCase()}: ${value || "NOT_SET"}`, {
        id: "Environment",
      });
    }
  }

  log(message: string, id = "") {
    if (this.enabled) {
      this.logger.log("info", message, { id });
    }
  }

  debug(message: string, id = "") {
    if (this.enabled && !extractBooleanEnvVar("DISABLE_LOGGER_DEBUG")) {
      this.logger.debug(message, { id });
    }
  }

  info(message: string, id = "") {
    if (this.enabled && !extractBooleanEnvVar("DISABLE_LOGGER_INFO")) {
      this.logger.info(message, { id });
    }
  }

  warn(message: string, id = "") {
    if (this.enabled && !extractBooleanEnvVar("DISABLE_LOGGER_WARN")) {
      this.logger.warn(message, { id });
    }
  }

  error(message: string, id = "") {
    if (this.enabled && !extractBooleanEnvVar("DISABLE_LOGGER_ERROR")) {
      this.logger.error(message, { id });
    }
  }
}

function setTransport(): any {
  if (process.env.REMOTE_LOGGING_GCP_PROJECT) {
    // const chain = process.env.chain;
    // const network = process.env.NETWORK_ID;
    console.log("setting gcp remote logger");
    const gcpLogging = new LoggingWinston({
      level: extractBooleanEnvVar("VERBOSE") ? "debug" : "info",
      projectId: process.env.REMOTE_LOGGING_GCP_PROJECT,
    });
    return [gcpLogging];
  } else {
    console.log("setting console logger");
    return [
      new winston.transports.Console({
        level: extractBooleanEnvVar("VERBOSE") ? "debug" : "info",
        eol: "\r\n",
      }),
    ];
  }
}
