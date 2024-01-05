import config from "./config/config.js";
import logger from "./config/logger.js";
import app from "./app.js";
import Runner from "./Runner.js";

import type { Server } from "http";

const server: Server = app.listen(config.port, () => {
  console.log(
    `🚀 server started at ${
      config.env === "production"
        ? "https://task.switchboard.xyz"
        : "http://localhost"
    }:${config.port}`
  );
});

// attempt to preload the runner
const runner = Runner.getInstance().catch((error) => {
  logger.error(error);
});

const exitHandler = () => {
  if (server) {
    server.close(() => {
      logger.info("Server closed");
      process.exit(1);
    });
  } else {
    process.exit(1);
  }
};

const unexpectedErrorHandler = (error: any) => {
  logger.error(error);
  exitHandler();
};

process.on("uncaughtException", unexpectedErrorHandler);
process.on("unhandledRejection", unexpectedErrorHandler);

["SIGTERM", "SIGINT", "exit"].forEach((signal) => {
  process.on(signal, () => {
    logger.info(`${signal} received`);
    exitHandler();
    // if (server) {
    //   server.close();
    // }
  });
});
