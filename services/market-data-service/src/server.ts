import cors from "cors";
import express, { type Request, type Response } from "express";
import { Pool } from "pg";
import { createMarketRouter } from "./transport/marketRoutes.js";
import { createStockRouter } from "./transport/stockRoutes.js";
import { createCseClient } from "./upstream/cseClient.js";
import { createEventBus } from "./transport/eventBus.js";
import { env } from "./serverEnv.js";
import { createAlertsRouter } from "./transport/alertsRoutes.js";
import { createPortfolioRouter } from "./transport/portfolioRoutes.js";
import { createAuthRouter } from "./transport/authRoutes.js";
import { createWatchlistsRouter } from "./transport/watchlistsRoutes.js";
import { createAppCache } from "./cache/redisCache.js";
import { createOfflineMarketService } from "./services/offlineMarketService.js";
import { createBacktestRunsRouter } from "./transport/backtestRunsRoutes.js";
import { createBrokerRouter } from "./transport/brokerRoutes.js";
import { createAdminRouter } from "./transport/adminRoutes.js";
import { createRiskRouter } from "./transport/riskRoutes.js";

export async function createApp(): Promise<express.Express> {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  const cseClient = createCseClient();
  const eventBus = await createEventBus();
  const cache = await createAppCache(env.REDIS_URL);
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  await pool.query("select 1");
  const offlineMarketService = createOfflineMarketService({ pool, cache, cseClient });

  const user = await pool.query<{ id: string }>(
    `
    INSERT INTO users(email, display_name)
    VALUES ($1, $2)
    ON CONFLICT (email) DO UPDATE SET updated_at = now()
    RETURNING id
    `,
    [env.LOCAL_USER_EMAIL, "Local User"]
  );
  const fallbackUserId = user.rows[0]!.id;

  app.get("/health", async (_req: Request, res: Response) => {
    try {
      await pool.query("select 1");
      res.json({ status: "ok", db: "ok" });
    } catch (error) {
      res.status(500).json({ status: "degraded", db: (error as Error).message });
    }
  });

  app.use("/api/market", createMarketRouter({ pool, cseClient, eventBus, offlineMarketService }));
  app.use("/api/stocks", createStockRouter({ pool, offlineMarketService }));
  app.use("/api/auth", createAuthRouter({ pool }));
  app.use("/api/alerts", createAlertsRouter({ pool, fallbackUserId, offlineMarketService }));
  app.use(
    "/api/portfolio",
    createPortfolioRouter({ pool, fallbackUserId, portfolioName: env.DEFAULT_PORTFOLIO_NAME, cseClient })
  );
  app.use("/api/watchlists", createWatchlistsRouter({ pool, fallbackUserId }));
  app.use("/api/backtests", createBacktestRunsRouter({ pool }));
  app.use("/api/broker", createBrokerRouter({ pool, offlineMarketService, portfolioName: env.DEFAULT_PORTFOLIO_NAME }));
  app.use("/api/admin", createAdminRouter({ pool }));
  app.use("/api/risk", createRiskRouter({ pool, offlineMarketService, portfolioName: env.DEFAULT_PORTFOLIO_NAME }));

  void offlineMarketService.refreshAndPersistMarketWatch().catch(() => {});
  setInterval(() => {
    void offlineMarketService.refreshAndPersistMarketWatch().catch(() => {});
  }, env.MARKET_SYNC_INTERVAL_MS).unref();

  return app;
}
