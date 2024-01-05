#!/usr/bin/env -S pnpm exec tsx -r dotenv/config

import { simulate } from "./actions/simulate";
import { testAggregator, testJob } from "./actions/test";
import {
  CHAIN_OPTION,
  CLUSTER_OPTION,
  MAINNET_URL_OPTION,
  RPC_URL_OPTION,
} from "./options";

import chalk from "chalk";
import { Command, Option } from "commander";
import dotenv from "dotenv";
import _ from "lodash";

dotenv.config();

export const CHECK_ICON = chalk.green("\u2714");
export const FAILED_ICON = chalk.red("\u2717");

const program = new Command();

program.name("sb-tools").description("Repo tools").version("1.0.0");

program
  .command(`test-aggregator <aggregatorKey>`)
  .description(
    "Simulate an aggregator key against the switchboard-v2 task-runner"
  )
  .addOption(MAINNET_URL_OPTION)
  .addOption(CLUSTER_OPTION)
  .addOption(CHAIN_OPTION)
  .addOption(RPC_URL_OPTION)
  .action(testAggregator)
  .addHelpText(
    "after",
    `

Example call:
  $ sb-tools test-aggregator GvDMxPzN1sCj7L26YDK2HnMRXEQmQ2aemov8YBtPS7vR
  $ sb-tools test-aggregator GvDMxPzN1sCj7L26YDK2HnMRXEQmQ2aemov8YBtPS7vR --cluster devnet
  $ sb-tools test-aggregator GvDMxPzN1sCj7L26YDK2HnMRXEQmQ2aemov8YBtPS7vR --skipClients`
  );

program
  .command(`test-job <aggregatorKey>`)
  .description(
    "Simulate an aggregator key against the switchboard-v2 task-runner"
  )
  .addOption(MAINNET_URL_OPTION)
  .addOption(CLUSTER_OPTION)
  .addOption(CHAIN_OPTION)
  .addOption(RPC_URL_OPTION)
  .action(testJob)
  .addHelpText(
    "after",
    `

Example call:
  $ sb-tools test-job DrgD1L43sVzYGprcYSDHAoxZa5u6un7zrt6eQZyUJegV
  $ sb-tools test-job DrgD1L43sVzYGprcYSDHAoxZa5u6un7zrt6eQZyUJegV --cluster devnet
  $ sb-tools test-job DrgD1L43sVzYGprcYSDHAoxZa5u6un7zrt6eQZyUJegV --skipClients`
  );

program
  .command(`simulate <simulationTarget>`)
  .description(
    "Simulate a JSON file or directory against the switchboard-v2 task-runner"
  )
  .addOption(MAINNET_URL_OPTION)
  .addOption(CLUSTER_OPTION)
  .addOption(RPC_URL_OPTION)
  .addOption(
    new Option("--all", "Output the full task receipt").default(
      false,
      "false, output just the final result"
    )
  )
  .action(simulate)
  .addHelpText(
    "after",
    `

Example call:
  $ sbv2-task json ./job-directory
  $ sbv2-task json ./job-directory/job.jsonc`
  );

program.parse(process.argv);
