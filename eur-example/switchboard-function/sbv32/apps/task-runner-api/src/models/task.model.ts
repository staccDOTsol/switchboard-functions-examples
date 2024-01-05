import type { OracleJob } from "@switchboard-xyz/task-runner";

/**
 * @swagger
 * components:
 *    schemas:
 *      TaskRequest:
 *        type: object
 *        required:
 *          - task
 *        properties:
 *          cluster:
 *            type: string
 *            enum: [mainnet-beta, devnet]
 *          task:
 *            $ref: '#/components/schemas/ITask'
 *          input:
 *            type: string
 *          api_key:
 *            type: string
 */
export type TaskRequest = {
  cluster?: "devnet" | "mainnet-beta";
  task: OracleJob.ITask;
  input?: string;
  api_key?: string;
};

/**
 * @swagger
 * components:
 *    schemas:
 *      TaskResponse:
 *        type: object
 *        required:
 *          - result
 *          - numericResult
 *          - taskType
 *          - input
 *          - task_runner_version
 *        properties:
 *          result:
 *            type: string
 *          numericResult:
 *            type: boolean
 *          taskType:
 *            type: string
 *          input:
 *            type: string
 *          task_runner_version:
 *            type: string
 */
export type TaskResponse = {
  result: string;
  numericResult: boolean;
  taskType: string;
  input: string;
  task_runner_version: string;
};

/**
 * @swagger
 * components:
 *    schemas:
 *      TaskResponseError:
 *        type: object
 *        required:
 *          - error
 *          - task_runner_version
 *        properties:
 *          error:
 *            type: string
 *          task_runner_version:
 *            type: string
 */
export type TaskResponseError = {
  error: string;
  task_runner_version: string;
};
