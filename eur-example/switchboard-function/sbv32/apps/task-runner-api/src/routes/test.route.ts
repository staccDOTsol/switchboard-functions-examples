import type { Request, Response, Router } from "express";
import express from "express";

const router: Router = express.Router();

/**
 * @swagger
 * /test:
 *   get:
 *     summary: Test
 *     description: Test
 *     tags: [Test]
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 greeting:
 *                   type: string
 *       "400":
 *         $ref: '#/components/responses/BadRequest'
 *       "404":
 *         $ref: '#/components/responses/NotFound'
 */
router.route("/").get((req: Request, res: Response) => {
  res.json({ greeting: "Hello World!" });
});

export default router;
