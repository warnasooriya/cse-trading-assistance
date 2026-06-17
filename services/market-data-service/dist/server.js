import cors from "cors";
import express from "express";
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
export async function createApp() {
    const app = express();
    app.use(cors());
    app.use(express.json({ limit: "1mb" }));
    const cseClient = createCseClient();
    const eventBus = await createEventBus();
    const cache = await createAppCache(env.REDIS_URL);
    const pool = new Pool({ connectionString: env.DATABASE_URL });
    await pool.query("select 1");
    const offlineMarketService = createOfflineMarketService({ pool, cache, cseClient });
    const user = await pool.query(`
    INSERT INTO users(email, display_name)
    VALUES ($1, $2)
    ON CONFLICT (email) DO UPDATE SET updated_at = now()
    RETURNING id
    `, [env.LOCAL_USER_EMAIL, "Local User"]);
    const fallbackUserId = user.rows[0].id;
    app.get("/health", async (_req, res) => {
        try {
            await pool.query("select 1");
            res.json({ status: "ok", db: "ok" });
        }
        catch (error) {
            res.status(500).json({ status: "degraded", db: error.message });
        }
    });
    app.use("/api/market", createMarketRouter({ cseClient, eventBus, offlineMarketService }));
    app.use("/api/stocks", createStockRouter({ cseClient, offlineMarketService }));
    app.use("/api/auth", createAuthRouter({ pool }));
    app.use("/api/alerts", createAlertsRouter({ pool, fallbackUserId }));
    app.use("/api/portfolio", createPortfolioRouter({ pool, fallbackUserId, portfolioName: env.DEFAULT_PORTFOLIO_NAME, cseClient }));
    app.use("/api/watchlists", createWatchlistsRouter({ pool, fallbackUserId }));
    void offlineMarketService.refreshAndPersistMarketWatch().catch(() => { });
    setInterval(() => {
        void offlineMarketService.refreshAndPersistMarketWatch().catch(() => { });
    }, env.MARKET_SYNC_INTERVAL_MS).unref();
    return app;
}
