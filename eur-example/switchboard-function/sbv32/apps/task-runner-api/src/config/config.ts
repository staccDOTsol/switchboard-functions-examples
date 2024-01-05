import dotenv from "dotenv";
import fs from "fs";
import Joi from "joi";
import path from "path";

dotenv.config();

const envVarsSchema = Joi.object()
  .keys({
    NODE_ENV: Joi.string()
      .valid("production", "development", "test")
      .default("development"),
    VERBOSE: Joi.boolean().falsy("0").truthy("1").optional().default(false),
    PORT: Joi.number().default(
      process.env.NODE_ENV === "production" ? 8080 : 3000
    ),
    SOLANA_MAINNET_ENDPOINT: Joi.string().required(),
    SOLANA_DEVNET_ENDPOINT: Joi.string().required(),
    JUPITER_SWAP_API_KEY: Joi.string().required(),
  })
  .unknown();

const { value: envVars, error } = envVarsSchema
  .prefs({ errors: { label: "key" } })
  .validate(process.env);

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

const projectDirectory = getProjectRoot();
const publicLocation = path.join(projectDirectory, "public");

export default {
  env: envVars.NODE_ENV,
  verbose: envVars.VERBOSE,
  port: envVars.PORT,
  solanaMainnetEndpoint: envVars.SOLANA_MAINNET_ENDPOINT,
  solanaDevnetEndpoint: envVars.SOLANA_DEVNET_ENDPOINT,
  jupiterSwapApiKey: envVars.JUPITER_SWAP_API_KEY,
  publicLocation: publicLocation,
  projectDirectory: projectDirectory,
};

function getProjectRoot(): string {
  // recursively loop until we find a parent directory named public
  let tryCount = 5;
  let dirPath = __dirname;
  while (tryCount > 0) {
    const dirName = path.basename(dirPath);
    if (dirName === "task-runner-api") {
      break;
    }

    dirPath = path.dirname(dirPath);
    --tryCount;

    // if parent directory is the root or if we're out of tries
    if (path.resolve(dirPath) === path.parse(path.sep).root || tryCount === 0) {
      dirPath = path.join(process.cwd());
      break;
    }
  }

  if (!fs.existsSync(dirPath)) {
    throw new Error(`Failed to find project root directory`);
  }

  return dirPath;
}

// TODO: Add logic to load a different public directory if NODE_ENV is production
// OpenAI plugin has a different config
function getPublicDirectory(): string {
  // recursively loop until we find a parent directory named public
  let tryCount = 5;
  let publicDirPath = path.join(__dirname, "public");
  while (tryCount > 0) {
    if (
      fs.existsSync(publicDirPath) &&
      fs.statSync(publicDirPath).isDirectory()
    ) {
      break;
    }

    publicDirPath = path.join(path.dirname(publicDirPath), "public");
    --tryCount;

    // if parent directory is the root or if we're out of tries
    if (
      path.resolve(publicDirPath) === path.parse(path.sep).root ||
      tryCount === 0
    ) {
      publicDirPath = path.join(process.cwd(), "public");
      break;
    }
  }

  if (!fs.existsSync(publicDirPath)) {
    throw new Error(`Failed to find 'public' directory`);
  }

  return publicDirPath;
}
