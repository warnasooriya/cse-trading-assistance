import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { Pool } from "pg";
import { getAuthUserFromRequest } from "../auth.js";
import { env } from "../serverEnv.js";
import type { createOfflineMarketService } from "../services/offlineMarketService.js";
import { getOrCreateRiskLimits, updateRiskLimits, resetKillSwitch, getRiskStatus } from "../services/riskEngine.js";

type Deps = {
  pool: Pool;
  offlineMarketService: ReturnType<typeof createOfflineMarketService>;
  portfolioName: string;
};

const limitsBodySchema = z.object({
  maxPositionPctOfPortfolio: z.coerce.number().positive().max(100).optional(),
  maxPortfolioExposurePct: z.coerce.number().positive().max(100).optional(),
  maxDailyLossPct: z.coerce.number().positive().max(100).optional(),
  maxOpenPositions: z.coerce.number().int().positive().optional(),
  defaultStopLossPct: z.coerce.number().positive().max(100).optional(),
  defaultTakeProfitPct: z.coerce.number().positive().max(1000).optional()
});

function requireUserId(req: Request): string {
  const user = getAuthUserFromRequest(req, env.JWT_SECRET);
  if (!user?.id) {
    throw new Error("Unauthorized");
  }
  return user.id;
}

async function ensureUserPortfolio(pool: Pool, userId: string, name: string): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `
    INSERT INTO portfolios(user_id, name)
    VALUES ($1, $2)
    ON CONFLICT (user_id, name) DO UPDATE SET updated_at = now()
    RETURNING id
    `,
    [userId, name]
  );
  return result.rows[0]!.id;
}

async function getCashBalance(pool: Pool, userId: string): Promise<number> {
  const result = await pool.query<{ cash_balance: string }>(
    `
    SELECT cash_balance::text
    FROM broker_accounts
    WHERE user_id = $1
    ORDER BY is_default DESC, updated_at DESC
    LIMIT 1
    `,
    [userId]
  );
  const value = Number(result.rows[0]?.cash_balance ?? 0);
  return Number.isFinite(value) ? value : 0;
}

export function createRiskRouter({ pool, offlineMarketService, portfolioName }: Deps): Router {
  const router = Router();

  router.get("/limits", async (req: Request, res: Response) => {
    try {
      const userId = requireUserId(req);
      res.json(await getOrCreateRiskLimits(pool, userId));
    } catch (error) {
      const message = (error as Error).message;
      res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
    }
  });

  router.put("/limits", async (req: Request, res: Response) => {
    try {
      const userId = requireUserId(req);
      const body = limitsBodySchema.parse(req.body);
      res.json(await updateRiskLimits(pool, userId, body));
    } catch (error) {
      const message = (error as Error).message;
      res.status(message === "Unauthorized" ? 401 : 400).json({ error: message });
    }
  });

  router.get("/status", async (req: Request, res: Response) => {
    try {
      const userId = requireUserId(req);
      const portfolioId = await ensureUserPortfolio(pool, userId, portfolioName);
      const cashBalance = await getCashBalance(pool, userId);
      const status = await getRiskStatus({ pool, offlineMarketService, userId, portfolioId, cashBalance });
      res.json(status);
    } catch (error) {
      const message = (error as Error).message;
      res.status(message === "Unauthorized" ? 401 : 502).json({ error: message });
    }
  });

  router.get("/events", async (req: Request, res: Response) => {
    try {
      const userId = requireUserId(req);
      const events = await pool.query(
        `
        SELECT id, event_type, symbol, details, created_at
        FROM risk_events
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 50
        `,
        [userId]
      );
      res.json(events.rows);
    } catch (error) {
      const message = (error as Error).message;
      res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
    }
  });

  router.post("/kill-switch/reset", async (req: Request, res: Response) => {
    try {
      const userId = requireUserId(req);
      res.json(await resetKillSwitch(pool, userId));
    } catch (error) {
      const message = (error as Error).message;
      res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
    }
  });

  return router;
}
