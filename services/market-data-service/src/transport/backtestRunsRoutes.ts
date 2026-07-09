import { Router, type Request, type Response } from "express";
import type { Pool } from "pg";
import { z } from "zod";
import { getAuthUserFromRequest } from "../auth.js";
import { env } from "../serverEnv.js";
import { writeAuditLog } from "../services/auditService.js";

type Deps = { pool: Pool };

const backtestSaveSchema = z.object({
  name: z.string().trim().min(1),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  parameters: z.record(z.string(), z.unknown()),
  metrics: z.record(z.string(), z.unknown()),
  equityCurve: z.array(
    z.object({
      time: z.string(),
      equity: z.number()
    })
  ),
  trades: z.array(z.record(z.string(), z.unknown())).default([])
});

function requireUserId(req: Request): string {
  const user = getAuthUserFromRequest(req, env.JWT_SECRET);
  if (!user?.id) {
    throw new Error("Unauthorized");
  }
  return user.id;
}

export function createBacktestRunsRouter({ pool }: Deps): Router {
  const router = Router();

  router.get("/", async (req: Request, res: Response) => {
    try {
      const userId = requireUserId(req);
      const result = await pool.query(
        `
        SELECT id, name, parameters, metrics, equity_curve, trades, started_at, ended_at, created_at
        FROM backtest_results
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 20
        `,
        [userId]
      );
      res.json(result.rows);
    } catch (error) {
      const message = (error as Error).message;
      res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
    }
  });

  router.get("/:id", async (req: Request, res: Response) => {
    try {
      const userId = requireUserId(req);
      const result = await pool.query(
        `
        SELECT id, name, parameters, metrics, equity_curve, trades, started_at, ended_at, created_at
        FROM backtest_results
        WHERE id = $1 AND user_id = $2
        `,
        [req.params.id, userId]
      );
      if (!result.rows[0]) {
        res.status(404).json({ error: "Backtest run not found" });
        return;
      }
      res.json(result.rows[0]);
    } catch (error) {
      const message = (error as Error).message;
      res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
    }
  });

  router.post("/", async (req: Request, res: Response) => {
    try {
      const userId = requireUserId(req);
      const body = backtestSaveSchema.parse(req.body);
      const result = await pool.query<{ id: string }>(
        `
        INSERT INTO backtest_results(user_id, name, parameters, metrics, equity_curve, trades, started_at, ended_at)
        VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7, $8)
        RETURNING id
        `,
        [
          userId,
          body.name,
          JSON.stringify(body.parameters),
          JSON.stringify(body.metrics),
          JSON.stringify(body.equityCurve),
          JSON.stringify(body.trades),
          body.startedAt,
          body.endedAt
        ]
      );
      await writeAuditLog({
        pool,
        userId,
        action: "BACKTEST_SAVED",
        entityType: "backtest",
        entityId: result.rows[0]!.id,
        metadata: { name: body.name }
      });
      res.status(201).json({ id: result.rows[0]!.id });
    } catch (error) {
      const message = (error as Error).message;
      res.status(message === "Unauthorized" ? 401 : 400).json({ error: message });
    }
  });

  router.delete("/:id", async (req: Request, res: Response) => {
    try {
      const userId = requireUserId(req);
      await writeAuditLog({
        pool,
        userId,
        action: "BACKTEST_DELETED",
        entityType: "backtest",
        entityId: req.params.id,
        metadata: {}
      });
      await pool.query("DELETE FROM backtest_results WHERE id = $1 AND user_id = $2", [req.params.id, userId]);
      res.status(204).send();
    } catch (error) {
      const message = (error as Error).message;
      res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
    }
  });

  return router;
}
