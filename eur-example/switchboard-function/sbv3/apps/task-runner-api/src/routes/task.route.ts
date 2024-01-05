import validate from "../middlewares/validate.js";
import Runner from "../Runner.js";
import taskValidation from "../validations/task.validation.js";

import type { Request, Response, Router } from "express";
import express from "express";

const router: Router = express.Router();

/**
 * @swagger
 * /task:
 *   post:
 *     summary: Run Task
 *     description: Run a single task with an optional input against the Switchboard task runner and return a receipt containing the input and output of the task
 *     tags: [Test, Run, TaskRunner, Simulate, OracleJob]
 *     operationId: run
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TaskRequest'
 *           examples:
 *             valueTask: # Name
 *                summary: example adding two numbers to get 420
 *                value:
 *                  input: 200
 *                  task:
 *                    addTask:
 *                      scalar: 220
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                - $ref: '#/components/schemas/TaskResponse'
 *                - $ref: '#/components/schemas/TaskResponseError'
 *       "400":
 *         $ref: '#/components/responses/BadRequest'
 *       "404":
 *         $ref: '#/components/responses/NotFound'
 */
router
  .route("/")
  .post(
    validate(taskValidation.taskRequest),
    async (req: Request, res: Response) => {
      const runner = await Runner.getInstance();
      const response = await runner.runTask(req.body);
      res.json(response);
    }
  );

export default router;
