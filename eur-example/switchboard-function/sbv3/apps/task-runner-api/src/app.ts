import config from "./config/config.js";
import morgan from "./config/morgan.js";
import { errorConverter, errorHandler } from "./middlewares/error.js";
import routes from "./routes/index.js";
import ApiError from "./utils/ApiError.js";
import swaggerDocument from "./swagger.js";

import compression from "compression";
import cors from "cors";
import type { Express, NextFunction, Request, Response } from "express";
import express from "express";
import fs from "fs";
import path from "path";
import yaml from "yaml";
const helmet = require("helmet");
import logger from "./config/logger.js";

import httpStatus from "http-status";

function getPublicFiles(
  dir: string,
  _files: Array<string> = []
): Array<string> {
  const files = [..._files];
  fs.readdirSync(dir).forEach((file) => {
    const fileLocation = path.join(dir, file);
    if (fs.statSync(fileLocation).isDirectory()) {
      const dirFiles = getPublicFiles(fileLocation, files);
      files.push(...dirFiles);
    } else {
      files.push(fileLocation);
    }
  });

  return Array.from(new Set(files).values());
}

const app: Express = express();

if (config.env !== "test") {
  app.use(morgan.successHandler);
  app.use(morgan.errorHandler);
}

// set security HTTP headers
app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
  })
);

// parse json request body
app.use(express.json());

// parse urlencoded request body
app.use(express.urlencoded({ extended: true }));

// gzip compression
app.use(compression());

// enable cors
app.use(cors());
app.options("*", cors());

// first save the OpenAPI spec to the public directory
fs.writeFileSync(
  path.join(config.publicLocation, "OpenAPI.yaml"),
  yaml.stringify(swaggerDocument)
);
fs.writeFileSync(
  path.join(config.publicLocation, "OpenAPI.json"),
  JSON.stringify(swaggerDocument)
);

// then serve public files
const publicFiles = getPublicFiles(config.publicLocation);
if (publicFiles.length === 0) {
  throw new Error(`Failed to find any files in 'public' directory`);
}
publicFiles.forEach((file) => {
  const route = file
    .replace(config.publicLocation, "")
    .slice(path.sep.length)
    .toLowerCase();
  app.use(`/${route}`, express.static(file));
  logger.info(
    `Registered route: /${route.padEnd(32, " ")} @ ${path.relative(
      process.cwd(),
      file
    )}`
  );
});

// finally register the OpenAI plugin manifest based on environment
const pluginManifest = path.join(
  config.projectDirectory,
  ".well-known",
  `ai-plugin.${config.env === "production" ? "production" : "development"}.json`
);
if (!fs.existsSync(pluginManifest)) {
  throw new Error(`Failed to find OpenAI plugin manifest`);
}
app.use(`/.well-known/ai-plugin.json`, express.static(pluginManifest));
logger.info(
  `Registered route: /${".well-known/ai-plugin.json".padEnd(
    32,
    " "
  )} @ ${path.relative(process.cwd(), pluginManifest)}`
);

// api routes
app.use("/", routes);

// send back a 404 error for any unknown api request
app.use((req: Request, res: Response, next: NextFunction) => {
  next(new ApiError(httpStatus.NOT_FOUND, "Not found"));
});

// convert error to ApiError, if needed
app.use(errorConverter);

// handle error
app.use(errorHandler);

export default app;
