import validate from "../middlewares/validate.js";
import Runner from "../Runner.js";
import simulateValidation from "../validations/simulate.validation.js";

import type { Request, Response, Router } from "express";
import express from "express";

const router: Router = express.Router();

/**
 * @swagger
 * /simulate:
 *   post:
 *     summary: Simulate Jobs
 *     description: Simulate a list of jobs and return the median of the successful job responses.
 *     tags: [Test, Simulate, TaskRunner, Run]
 *     operationId: simulate
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SimulateRequest'
 *           example:
 *             basic:
 *                summary: basic job simulation
 *                value:
 *                  jobs:
 *                  -
 *                    tasks:
 *                    -
 *                      valueTask:
 *                        value: 200
 *                    -
 *                      addTask:
 *                        scalar: 220
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                - $ref: '#/components/schemas/SimulateResponse'
 *                - $ref: '#/components/schemas/SimulateResponseError'
 *       "400":
 *         $ref: '#/components/responses/BadRequest'
 *       "404":
 *         $ref: '#/components/responses/NotFound'
 */
router
  .route("/")
  .post(
    validate(simulateValidation.simulateRequest),
    async (req: Request, res: Response) => {
      const runner = await Runner.getInstance();
      const response = await runner.simulate(req.body);
      res.status(200).json(response);
    }
  );

export default router;
