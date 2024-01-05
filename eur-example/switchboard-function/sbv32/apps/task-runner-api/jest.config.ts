import { compilerOptions } from "./tsconfig.json";

import type { JestConfigWithTsJest } from "ts-jest";
import { pathsToModuleNameMapper } from "ts-jest";

const jestConfig: JestConfigWithTsJest = {
  // preset: "ts-jest",
  // moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths),
  // moduleNameMapper: {
  //   "@/(.*)$": "<rootDir>/src/$1",
  // },
  // moduleDirectories: ["<rootDir>/src", "node_modules"],
  testEnvironment: "node",
  extensionsToTreatAsEsm: [".ts"],
  testEnvironmentOptions: {
    NODE_ENV: "test",
  },
  restoreMocks: true,
  coverageDirectory: "./tests/.coverage",
  collectCoverageFrom: ["src/**/*.ts"],
  coveragePathIgnorePatterns: [
    "node_modules",
    "src/config",
    "src/app.ts",
    "tests",
  ],
  coverageReporters: ["text", "lcov", "clover", "html"],
  // moduleNameMapper: {
  //   "^@/(.*)$": "<rootDir>/src/$1",
  // },
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  transform: {
    // '^.+\\.[tj]sx?$' to process js/ts with `ts-jest`
    // '^.+\\.m?[tj]sx?$' to process js/ts/mjs/mts with `ts-jest`
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        useESM: true,
        tsconfig: "./tests/tsconfig.json",
      },
    ],
  },
};

export default jestConfig;
