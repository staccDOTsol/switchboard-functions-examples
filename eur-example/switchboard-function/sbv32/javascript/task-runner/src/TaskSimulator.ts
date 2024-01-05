import { TaskRunnerClients } from "./ctx/clients/TaskRunnerClients.js";
import type {
  ITaskRunner,
  ITaskRunnerClients,
  ITaskRunnerLogger,
  TaskRunnerReceipt,
} from "./types/types.js";
import { TaskRunner } from "./TaskRunner.js";

import { clusterApiUrl, Connection, Keypair } from "@solana/web3.js";
import { OracleJob, serializeOracleJob } from "@switchboard-xyz/common";
import * as sbv2 from "@switchboard-xyz/solana.js";
import chalk from "chalk";
import * as dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

export type TaskSimulatorReceipt = TaskRunnerReceipt & {
  start: number;
  end: number;
};

export interface ITaskSimulatorConfig {
  verbose?: boolean;
  enableWorker?: boolean;
  preloadClients?: boolean;
  rpcUrl?: string;
  mainnetRpc?: string;
  jupiterApiKey?: string;
}

export class TaskSimulator extends TaskRunner {
  verbose = false;

  constructor(
    readonly program: sbv2.SwitchboardProgram,
    readonly mainnetEndpoint: string,
    readonly clients: ITaskRunnerClients,
    readonly logger: ITaskRunnerLogger = console,
    readonly config?: ITaskSimulatorConfig
  ) {
    process.env.SWITCHBOARD_TASK_SIMULATOR_ENABLED = "1";
    super(program, mainnetEndpoint, clients, logger);
    // Task.getInstance().websocketTask = this.websocketTask;
  }

  async loadClients(): Promise<boolean> {
    try {
      await Promise.all([this.clients.raydium.load()]);
      return true;
    } catch (error) {
      throw error;
    }
  }

  static async loadClusters(
    solanaMainnetEndpoint: string,
    solanaDevnetEndpoint: string,
    jupiterApiKey: string,
    logger: ITaskRunnerLogger
  ): Promise<{ mainnet: ITaskRunner; devnet: ITaskRunner }> {
    const mainnetConnection = new Connection(solanaMainnetEndpoint);
    const programs = await Promise.all([
      sbv2.SwitchboardProgram.load(mainnetConnection),
      sbv2.SwitchboardProgram.load(new Connection(solanaDevnetEndpoint)),
    ]);

    // build clients
    const clients = new TaskRunnerClients(
      programs[0],
      mainnetConnection,
      jupiterApiKey,
      logger
    );
    if (process.env.NODE_ENV && process.env.NODE_ENV === "production") {
      await clients.load(3);
    }

    return {
      mainnet: new TaskSimulator(programs[0], solanaMainnetEndpoint, clients),
      devnet: new TaskSimulator(programs[1], solanaMainnetEndpoint, clients),
    };
  }

  static async load(
    cluster: "devnet" | "mainnet-beta",
    config?: ITaskSimulatorConfig,
    logger: ITaskRunnerLogger = console
  ): Promise<TaskSimulator> {
    const mainnetRpc = config?.mainnetRpc
      ? config.mainnetRpc
      : cluster === "mainnet-beta" && config?.rpcUrl
      ? config.rpcUrl
      : clusterApiUrl("mainnet-beta");
    const rpcUrl = config?.rpcUrl ?? clusterApiUrl(cluster);
    const program = await sbv2.SwitchboardProgram.load(
      new Connection(rpcUrl),
      Keypair.fromSeed(new Uint8Array(32).fill(1))
    );

    return new TaskSimulator(
      program,
      mainnetRpc,
      new TaskRunnerClients(program, mainnetRpc, config?.jupiterApiKey, logger),
      logger,
      config
    );
  }

  readJsonFile(jsonPath: string): OracleJob {
    if (!jsonPath) {
      throw new Error("failed to provide json file");
    }
    if (!fs.existsSync(jsonPath)) {
      throw new Error(`json file does not exist: ${jsonPath}`);
    }
    const parsed = path.parse(jsonPath);
    const fileString = fs.readFileSync(jsonPath, "utf-8");
    if (parsed.ext === ".yaml") {
      return OracleJob.fromYaml(fileString);
    }
    return this.readFileString(fileString);
  }

  readFileString(fileString: string): OracleJob {
    if (!fileString) {
      throw new Error("failed to provide file string");
    }

    return serializeOracleJob(fileString);

    // const iJob: IOracleJob = JSON.parse(fileString);
    // if (
    //   !iJob ||
    //   !("tasks" in iJob) ||
    //   !Array.isArray(iJob.tasks) ||
    //   (iJob.tasks ?? []).length === 0
    // ) {
    //   throw new Error(`OracleJob has no valid tasks`);
    // }
    // return iJob;
  }

  async simulateJobJson(jsonPath: string) {
    const job = this.readJsonFile(jsonPath);

    try {
      console.log(
        `simulating task for json file... ${jsonPath.replace(
          process.cwd(),
          "."
        )} `
      );
      const start = Date.now();
      const receipt = await this.perform(jsonPath, job);
      const end = Date.now();
      const runTime = ((end - start) / 1000).toFixed(3);
      if ("result" in receipt) {
        console.log(
          chalk.green(`\u2714 ${receipt.result!.toFixed()}`.padEnd(12)),
          `${runTime} sec`.padEnd(10)
        );
        return receipt;
      } else {
        // console.log(
        //   `${chalk.red("\u2717", "Task failed")} ${
        //     receipt.error
        //   }\n${JSON.stringify(receipt, undefined, 2)}`
        // );
        console.log(`${chalk.red("\u2717", "Task failed")} ${receipt.error}`);
        throw receipt.error!;
      }
    } catch (error: any) {
      console.log(chalk.red("\u2717", "Task failed"), error.message);
      // this.logger.error((error as any).toString());
      throw error;
    }
  }

  async simulateOracleJob(
    oracleJob: OracleJob,
    address = ""
  ): Promise<
    TaskRunnerReceipt & {
      start: number;
      end: number;
      runTime: string;
    }
  > {
    const job = OracleJob.fromObject(oracleJob.toJSON());
    const start = Date.now();
    const result = await this.perform(address, oracleJob);
    const end = Date.now();
    const runTime = ((end - start) / 1000).toFixed(3);
    return {
      ...result,
      start,
      end,
      runTime,
    };
  }

  async simulateOracleJobs(
    oracleJobs: { job: OracleJob; address?: string }[]
  ): Promise<{
    responses: PromiseSettledResult<
      TaskRunnerReceipt & {
        start: number;
        end: number;
        runTime: string;
      }
    >[];
    start: number;
    end: number;
    runTime: string;
  }> {
    const start = Date.now();
    const responses = await Promise.allSettled(
      oracleJobs.map((oracleJob) =>
        this.simulateOracleJob(oracleJob.job, oracleJob?.address ?? "")
      )
    );
    const end = Date.now();
    const runTime = ((end - start) / 1000).toFixed(3);

    return { responses, start, end, runTime };
  }

  async simulateAggregatorKey(aggregatorKey: string) {
    const [aggregatorAccount, aggregator] = await sbv2.AggregatorAccount.load(
      this.program,
      aggregatorKey
    );
    const jobs = await aggregatorAccount.loadJobs(aggregator);
    let numberSuccess = 0;
    for await (const [index, job] of jobs.entries()) {
      try {
        const start = Date.now();
        const receipt = await this.perform(
          job.account.publicKey.toBase58(),
          job.job
        );
        const end = Date.now();
        const runTime = ((end - start) / 1000).toFixed(3);
        if ("result" in receipt) {
          console.log(
            `${index + 1}:`.padEnd(3),
            chalk.green(`\u2714 ${receipt.result!.toFixed()}`.padEnd(12)),
            `${runTime} sec`.padEnd(10)
            // `(${getUrlFromTask(job)})`
          );
          numberSuccess += 1;
        } else {
          console.log(
            chalk.red("\u2717", "Task failed"),
            receipt.error,
            JSON.stringify(receipt, undefined, 2)
          );
          this.logger.error((receipt.error as any).toString());
        }
      } catch (error: any) {
        console.log(chalk.red("\u2717", "Task failed"), error.message);
        this.logger.error(error);
      }
    }

    console.log(chalk.blue("== Results =="));
    console.log(`Success: ${chalk.green(numberSuccess)} \\ ${jobs.length}`);
    console.log(
      `Failed:  ${chalk.red(jobs.length - numberSuccess)} \\ ${jobs.length}`
    );
  }

  async simulateJobKey(jobKey: string) {
    const [jobAccount, job] = await sbv2.JobAccount.load(this.program, jobKey);
    const oracleJob = OracleJob.decodeDelimited(job.data);

    try {
      console.log(`simulating task for job account... ${jobKey}`);
      const start = Date.now();
      const receipt = await this.perform(jobKey, oracleJob);
      const end = Date.now();
      const runTime = ((end - start) / 1000).toFixed(3);
      if ("result" in receipt) {
        console.log(
          chalk.green(`\u2714 ${receipt.result.toFixed(2)}`.padEnd(12)),
          `${runTime} sec`.padEnd(10),
          `(${TaskSimulator.getUrlFromTask(oracleJob)})`
        );
      } else {
        console.log(
          chalk.red("\u2717", "Task failed"),
          receipt.error,
          `\n${JSON.stringify(receipt, undefined, 2)}`
        );
        this.logger.error((receipt.error as any).toString());
      }
    } catch (error: any) {
      console.log(chalk.red("\u2717", "Task failed"), error.message);
      this.logger.error(error);
    }
  }

  async simulateJobJsonDirectory(directoryPath: string) {
    const directory = path.join(process.cwd(), directoryPath);
    const files = TaskSimulator.getAllFiles(
      directoryPath,
      [],
      [".json", ".jsonc"]
    );

    const errors: string[] = [];
    let numSuccess = 0;
    let numError = 0;
    for await (const file of files) {
      try {
        await this.simulateJobJson(file);
        numSuccess++;
      } catch (error) {
        numError++;

        // TODO: Dont rereun errors to get full trace
        let tasks = {};
        try {
          const job = this.readJsonFile(file);
          tasks = job.tasks ?? [];
        } catch {}
        errors.push(
          `File: ${file}\nError: ${error}\n${JSON.stringify(
            tasks,
            undefined,
            2
          )}`
        );
      }
    }

    console.log(`SUCCESS: ${chalk.green(numSuccess)} / ${files.length}`);
    console.log(`ERRORS : ${chalk.red(numError)} / ${files.length}`);

    if (errors.length) {
      const dateString = new Date().toLocaleString();
      const dateStringFormatted = new Date()
        .toLocaleString()
        .replace(/\//g, "-")
        .replace(/\:/g, "-")
        .replace(/\,/g, "")
        .replace(/\s/g, "_");
      const fileName = path.join(
        process.cwd(),
        `log.simulator-errors.${dateStringFormatted}.txt`
      );
      const delimiter =
        "---------------------------------------------------------------";
      fs.writeFileSync(
        fileName,
        `### Switchboard Task Simulator Errors ###\nDate: ${dateString}\nDirectory: ${directory}\n${delimiter}\n${errors.join(
          `\n${delimiter}\n`
        )}`
      );

      console.log(
        `Wrote #${errors.length
          .toString()
          .padEnd(4, " ")} errors to file, ${fileName.replace(
          process.cwd(),
          "."
        )}`
      );
    }
  }

  /**
   * Fetch a list of filepaths for a given directory and desired file extension
   * @param [dirPath] Filesystem path to a directory to search.
   * @param [arrayOfFiles] An array of existing file paths for recursive calls
   * @param [extensions] Optional, an array of desired extensions with the leading separator '.'
   * @throws {String}
   * @returns {string[]}
   */
  static getAllFiles(
    dirPath: string,
    arrayOfFiles: string[],
    extensions?: string[]
  ): string[] {
    const files = fs.readdirSync(dirPath, "utf8");

    arrayOfFiles = arrayOfFiles || [];

    files.forEach((file: string) => {
      if (fs.statSync(path.join(dirPath, file)).isDirectory()) {
        arrayOfFiles = TaskSimulator.getAllFiles(
          path.join(dirPath, file),
          arrayOfFiles,
          extensions
        );
      } else {
        const ext = path.extname(file);
        if (!extensions === undefined || extensions?.includes(ext)) {
          arrayOfFiles.push(path.join(path.join(dirPath, file)));
        }
      }
    });

    return arrayOfFiles;
  }

  /**
   * If the first task type in a job is httpTask or websocketTask, fetch the endpoint URL
   * @param [job] The OracleJob that should be checked.
   * @throws {String}
   * @returns {string}
   */
  static getUrlFromTask(job: OracleJob): string {
    const tasks = job && "tasks" in job ? job.tasks : [];
    if (tasks.length === 0) {
      return "";
    }
    const firstTask = tasks[0];
    const jobUrl = firstTask.httpTask
      ? firstTask.httpTask.url
      : firstTask.websocketTask
      ? firstTask.websocketTask.url
      : "";
    if (!jobUrl) {
      return "";
    }
    const parsedUrl = new URL(jobUrl);
    return "(" + parsedUrl.hostname + ")";
  }

  /**
   * For a given OracleJob, return a list of top level task types
   * @param [job] The OracleJob that should be parsed.
   * @throws {String}
   * @returns {ITaskType[]}
   */
  static getTaskTypes(job: OracleJob): string[] {
    const taskTypes: string[] = [];
    for (const task of job.tasks) {
      const taskType = OracleJob.Task.create(task).Task;
      if (taskType) {
        taskTypes.push(taskType);
      } else {
        console.warn(`Failed to get TaskType for Task ${JSON.stringify(task)}`);
      }
    }
    return taskTypes;
  }
}

export default TaskSimulator;
