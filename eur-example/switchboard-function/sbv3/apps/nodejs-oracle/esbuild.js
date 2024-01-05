#!/usr/bin/env node
const esbuild = require("esbuild");
// const { Generator } = require("npm-dts");
const { typecheckPlugin } = require("@jgoz/esbuild-plugin-typecheck");
const fs = require("fs");
const path = require("path");
const shell = require("shelljs");
const { execSync } = require("child_process");

function getVersion() {
  const versionPath = path.join(__dirname, "..", "..", "version");
  if (!fs.existsSync(versionPath)) {
    throw new Error(`Failed to get the version from path ${versionPath}`);
  }
  const version = fs.readFileSync(versionPath, "utf-8").trim();
  fs.writeFileSync(
    "./src/version.ts",
    `export const VERSION = "${version}";\n`
  );
}

// rebuild the task runner if needed
const taskrunnerWorkerPath = path.join(
  __dirname,
  "..",
  "..",
  "javascript",
  "task-runner",
  "lib",
  "ctx",
  "worker",
  "taskRunner.worker.cjs" // CommonJS is better for worker compatibility
);

const commonOptions = {
  format: "cjs",
  bundle: true,
  minify: true,
  platform: "node",
  sourcemap: "inline",
  sourcesContent: true,
  target: "node18",
  legalComments: "none",
  external: [],
  plugins: [typecheckPlugin()],
};

const isCI =
  process.env.CI && process.env.CI.length > 0 ? Boolean(process.env.CI) : false;

const isDev = true;

const wasmPlugin = {
  name: "wasm",
  setup(build) {
    // Resolve ".wasm" files to a path with a namespace
    build.onResolve({ filter: /\.wasm$/ }, (args) => {
      // If this is the import inside the stub module, import the
      // binary itself. Put the path in the "wasm-binary" namespace
      // to tell our binary load callback to load the binary file.
      if (args.namespace === "wasm-stub") {
        return {
          path: args.path,
          namespace: "wasm-binary",
        };
      }

      // Otherwise, generate the JavaScript stub module for this
      // ".wasm" file. Put it in the "wasm-stub" namespace to tell
      // our stub load callback to fill it with JavaScript.
      //
      // Resolve relative paths to absolute paths here since this
      // resolve callback is given "resolveDir", the directory to
      // resolve imports against.
      if (args.resolveDir === "") {
        return; // Ignore unresolvable paths
      }
      return {
        path: path.isAbsolute(args.path)
          ? args.path
          : path.join(args.resolveDir, args.path),
        namespace: "wasm-stub",
      };
    });

    // Virtual modules in the "wasm-stub" namespace are filled with
    // the JavaScript code for compiling the WebAssembly binary. The
    // binary itself is imported from a second virtual module.
    build.onLoad({ filter: /.*/, namespace: "wasm-stub" }, async (args) => ({
      contents: `import wasm from ${JSON.stringify(args.path)}
        export default (imports) =>
          WebAssembly.instantiate(wasm, imports).then(
            result => result.instance.exports)`,
    }));

    // Virtual modules in the "wasm-binary" namespace contain the
    // actual bytes of the WebAssembly file. This uses esbuild's
    // built-in "binary" loader instead of manually embedding the
    // binary data inside JavaScript code ourselves.
    build.onLoad({ filter: /.*/, namespace: "wasm-binary" }, async (args) => ({
      contents: fs.readFileSync(args.path),
      loader: "binary",
    }));
  },
};

async function buildOracle() {
  return await esbuild
    .build({
      ...commonOptions,
      entryPoints: ["./src/apps/oracle/index.ts"],
      outfile: "dist/oracle/index.js",
      plugins: [wasmPlugin],
      // metafile: !isCI,
    })
    // .then(({ metafile }) => {
    //   if (metafile && !isCI) {
    //     // analyze bundle size at https://esbuild.github.io/analyze/
    //     fs.writeFileSync(
    //       "dist/meta.oracle.json",
    //       JSON.stringify(metafile, null, 2),
    //       "utf-8"
    //     );
    //   }
    // })
    .then(() => {
      // copy the task runner worker
      shell.cp(
        "-f",
        taskrunnerWorkerPath,
        path.join(__dirname, "dist", "oracle", "taskRunner.worker.cjs")
      );

      // copy the wasm module
      const wasmPath = path.join(
        __dirname,
        "node_modules",
        "@switchboard-xyz",
        "ecvrf-wasm",
        "ecvrf_wasm_bg.wasm"
      );
      if (!fs.existsSync(wasmPath)) {
        throw new Error(`Failed to find rust-ecvrf wasm module`);
      }
      if (!fs.existsSync(path.dirname(wasmPath))) {
        fs.mkdirSync(path.dirname(wasmPath), { recursive: true });
      }
      shell.cp("-f", wasmPath, path.join(__dirname, "dist", "oracle"));
    });
}

async function buildCrank() {
  return await esbuild
    .build({
      ...commonOptions,
      entryPoints: ["./src/apps/crank/index.ts"],
      outfile: "dist/crank/index.js",
      // metafile: !isCI,
    })
    // .then(({ metafile }) => {
    //   if (metafile && !isCI) {
    //     // analyze bundle size at https://esbuild.github.io/analyze/
    //     fs.writeFileSync(
    //       "dist/meta.crank.json",
    //       JSON.stringify(metafile, null, 2),
    //       "utf-8"
    //     );
    //   }
    // });
    .then(() => {
      // copy the task runner worker
      shell.cp(
        "-f",
        taskrunnerWorkerPath,
        path.join(__dirname, "dist", "crank", "taskRunner.worker.cjs")
      );
    });
}

async function main() {
  fs.rmSync(path.join(__dirname, "dist"), {
    force: true,
    recursive: true,
  });
  fs.mkdirSync("dist/oracle", { recursive: true, force: true });
  fs.mkdirSync("dist/crank", { recursive: true, force: true });

  getVersion();

  // buildTaskRunner();

  await Promise.all([buildOracle(), buildCrank()]);
}

main().catch((error) => {
  console.error(error);
  throw error;
});
