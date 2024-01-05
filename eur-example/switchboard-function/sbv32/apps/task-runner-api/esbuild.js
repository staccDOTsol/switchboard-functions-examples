import { build } from "esbuild";
import path from "path";
import fs from "fs";
import shell from "shelljs";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outputDir = path.join(__dirname, "dist");

function writeOpenAIManifests() {
  const outputLocation = path.join(__dirname, ".well-known");
  [
    { env: "development", url: "http://localhost:3000" },
    { env: "production", url: "https://task.switchboard.xyz" },
  ].forEach((env) => {
    fs.writeFileSync(
      path.join(outputLocation, `ai-plugin.${env.env}.json`),
      JSON.stringify(
        {
          schema_version: "v1",
          name_for_human: "Switchboard Plugin",
          name_for_model: "switchboard_plugin",
          description_for_human:
            "Plugin for building and testing Switchboard OracleJob protobuf messages against the task runner.",
          description_for_model: `
Plugin for building and testing a Switchboard OracleJob protobuf message. 
You are an autonomous agent that will build OracleJob protobuf messages for customers in JSON format.
If building a job, you will run /simulate and also return the JobReceipt.
If building a task, you will run /task and also return the TaskReceipt.
When building a job, it may be helpful to incrementally run a task against /task and use the output to determine the next task.
An OracleJob stores an array of task types which instructs a server to fetch, parse, and transform a value until it reaches a single numerical result. The output of the previous task is the input to the next task. 
An OracleJob corresponds to a single data point. Multiple jobs can be run for added confidence from which the median result is used to determine the final result. 
Use the following task types to build an OracleJob message in JSON format. 
You may use the /simulate endpoint in order to test a job or the /task endpoint to test a single task with an optional input string. 
 - HttpTask: Makes an HTTP request to a URL and returns a JSON stringified response. Input: NONE, Output: Stringified JSON object. Fields: url (required), method, headers, and body. 
 - JsonParseTask: Extracts a field from a JSON object using JSON path notation. Input: Stringified JSON object, Output: Number. Fields: path (required) and aggregationMethod. 
 - MedianTask: Returns the median of results from subtasks and subjobs. Input: Any, Output: Number. Fields: tasks, jobs, and minSuccessfulRequired. 
 - ValueTask: Returns a static value. Input: None, Output: Number. Fields: value, aggregatorPubkey, and big. 
 - WebsocketTask: Maintains a websocket for fast data retrieval and returns the latest received stringified JSON object. Input: NONE, Output: Stringified JSON object. Fields: url (required), subscription (required), maxDataAgeSeconds, and filter. 
 - CacheItem: Executes a job, stores the result in a variable, and passes through the current running result. Fields: variableName (required) and job (required). 
 - CacheTask: Executes a job, stores the result in a variable, and passes through the current running result. Input: Any, Output: input. Fields: cacheItems (required).`
            .replace("\n", " ")
            .trim(),
          auth: {
            type: "none",
          },
          api: {
            type: "openapi",
            url: `${env.url}/openapi.yaml`,
            is_user_authenticated: false,
          },
          logo_url: `${env.url}/logo.png`,
          contact_email: "hello@switchboard.xyz",
          legal_info_url: "https://switchboard.xyz/legal",
        },
        undefined,
        2
      )
    );
  });
}

const isCI =
  process.env.CI && process.env.CI.length > 0 ? Boolean(process.env.CI) : false;

fs.rmSync(outputDir, {
  force: true,
  recursive: true,
});

writeOpenAIManifests();

// build main bundle
build({
  bundle: true,
  minify: false,
  platform: "node",
  sourcemap: true,
  target: "node18",
  plugins: [],
  format: "esm",
  entryPoints: [`./src/index.ts`],
  outdir: "dist",
  metafile: !isCI,
  external: ["swagger-ui-express"],
  banner: {
    js: `
    import { fileURLToPath } from 'url';
    import { createRequire as topLevelCreateRequire } from 'module';
    const require = topLevelCreateRequire(import.meta.url);
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    `,
  },
})
  .then(({ metafile }) => {
    if (metafile && !isCI) {
      // analyze bundle size at https://esbuild.github.io/analyze/
      fs.writeFileSync(
        path.join(__dirname, "dist", "meta.json"),
        JSON.stringify(metafile, null, 2),
        "utf-8"
      );
    }
  })
  .then(() => {
    execSync(`tsc -d --emitDeclarationOnly`, { encoding: "utf-8" });
  });
