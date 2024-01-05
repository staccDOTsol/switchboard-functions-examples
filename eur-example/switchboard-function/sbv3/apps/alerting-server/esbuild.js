#!/usr/bin/env node
/* eslint node/no-unpublished-require: 0 */
/* eslint no-unused-vars: 0 */
import { build } from "esbuild";
import fs from "fs";
import path from "path";
import shell from "shelljs";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const commonOptions = {
  bundle: true,
  minify: true,
  platform: "node",
  sourcemap: "inline",
  sourcesContent: true,
  target: "node18",
  plugins: [],
  legalComments: "none",
};

const isCI =
  process.env.CI && process.env.CI.length > 0 ? Boolean(process.env.CI) : false;

const tscPath = path.relative(
  process.cwd(),
  path.join(__dirname, "..", "..", "node_modules", "typescript", "bin", "tsc")
);

async function buildApp() {
  return await build({
    ...commonOptions,
    format: "cjs",
    entryPoints: ["./src/index.ts"],
    outfile: "dist/index.js",
    metafile: !isCI,
    plugins: [],
  })
    .then(({ metafile }) => {
      if (metafile && !isCI) {
        // analyze bundle size at https://esbuild.github.io/analyze/
        fs.writeFileSync(
          "dist/meta.json",
          JSON.stringify(metafile, null, 2),
          "utf-8"
        );
      }
    })
    .then(() => {
      execSync(`${tscPath} -d`, { encoding: "utf-8" });
    });
}

async function main() {
  fs.rmSync(path.join(__dirname, "dist"), {
    force: true,
    recursive: true,
  });

  await buildApp();
}

main().catch((error) => {
  console.error(error);
  throw error;
});
