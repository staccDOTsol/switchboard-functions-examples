import type { IOracleJob, OracleJob } from "@switchboard-xyz/task-runner";

/**
 * @swagger
 * components:
 *    schemas:
 *      SimulateRequest:
 *        type: object
 *        required:
 *          - jobs
 *        properties:
 *          cluster:
 *            type: string
 *            enum: [mainnet-beta, devnet]
 *          jobs:
 *            type: array
 *            items:
 *              $ref: '#/components/schemas/OracleJob'
 *          api_key:
 *            type: string
 */
export type SimulateRequest = {
  cluster?: "devnet" | "mainnet-beta";
  jobs: Array<IOracleJob>;
  api_key?: string;
};

/**
 * @swagger
 * components:
 *    schemas:
 *      TaskReceipt:
 *        type: object
 *        required:
 *          - taskType
 *          - input
 *          - output
 *          - task
 *        properties:
 *          taskType:
 *            type: string
 *          input:
 *            type: string
 *          output:
 *            type: string
 *          task:
 *            $ref: '#/components/schemas/ITask'
 */
export type TaskReceipt = {
  taskType: string;
  input: string;
  output: string;
  task: OracleJob.ITask;
};

/**
 * @swagger
 * components:
 *    schemas:
 *      JobReceipt:
 *        type: object
 *        properties:
 *          id:
 *            type: string
 *          result:
 *            type: string
 *          tasks:
 *            type: array
 *            items:
 *              $ref: "#/components/schemas/TaskReceipt"
 */
export type JobReceipt = {
  id: string;
  result: string;
  tasks: Array<TaskReceipt>;
};

/**
 * @swagger
 * components:
 *    schemas:
 *      SimulateResponse:
 *        type: object
 *        required:
 *          - results
 *          - receipts
 *          - task_runner_version
 *        properties:
 *          result:
 *            type: string
 *          error:
 *            type: string
 *          results:
 *            type: array
 *            items:
 *              type: string
 *          receipts:
 *            type: array
 *            items:
 *              $ref: "#/components/schemas/JobReceipt"
 *          task_runner_version:
 *            type: string
 */
export type SimulateResponse = {
  result: string;
  results: Array<string>;
  receipts: Array<JobReceipt>;
  task_runner_version: string;
};

/**
 * @swagger
 * components:
 *    schemas:
 *      SimulateResponseError:
 *        type: object
 *        required:
 *          - error
 *          - task_runner_version
 *        properties:
 *          error:
 *            type: string
 *          results:
 *            type: array
 *            items:
 *              type: string
 *          receipts:
 *            type: array
 *            items:
 *              $ref: "#/components/schemas/JobReceipt"
 *          task_runner_version:
 *            type: string
 */
export type SimulateResponseError = {
  error: string;
  results: Array<string>;
  receipts: Array<JobReceipt>;
  task_runner_version: string;
};
