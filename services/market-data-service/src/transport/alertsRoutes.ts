import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { Pool } from "pg";
import { getAuthUserFromRequest } from "../auth.js";
import { env } from "../serverEnv.js";
import type { createOfflineMarketService } from "../services/offlineMarketService.js";
import { computeIndicators } from "../services/technicalAnalysisClient.js";
import { writeAuditLog } from "../services/auditService.js";

type Deps = {
  pool: Pool;
  fallbackUserId: string;
  offlineMarketService: ReturnType<typeof createOfflineMarketService>;
};

const alertTypeSchema = z.enum([
  "AI Buy Signal",
  "AI Sell Signal",
  "Price Breakout",
  "RSI Oversold",
  "RSI Overbought",
  "Volume Spike"
]);

const alertChannelSchema = z.enum(["Email", "SMS", "Push"]);

type AlertRecord = {
  id: string;
  type: string;
  channel: string;
  is_enabled: boolean;
  criteria: unknown;
  symbol: string | null;
  last_triggered_at: string | null;
};

function mapAlertTypeToDb(type: z.infer<typeof alertTypeSchema>) {
  switch (type) {
    case "AI Buy Signal":
      return "AI_BUY_SIGNAL";
    case "AI Sell Signal":
      return "AI_SELL_SIGNAL";
    case "Price Breakout":
      return "PRICE_BREAKOUT";
    case "RSI Oversold":
      return "RSI_OVERSOLD";
    case "RSI Overbought":
      return "RSI_OVERBOUGHT";
    case "Volume Spike":
      return "VOLUME_SPIKE";
  }
}

function mapAlertTypeFromDb(type: string): z.infer<typeof alertTypeSchema> {
  switch (type) {
    case "AI_BUY_SIGNAL":
      return "AI Buy Signal";
    case "AI_SELL_SIGNAL":
      return "AI Sell Signal";
    case "PRICE_BREAKOUT":
      return "Price Breakout";
    case "RSI_OVERSOLD":
      return "RSI Oversold";
    case "RSI_OVERBOUGHT":
      return "RSI Overbought";
    case "VOLUME_SPIKE":
      return "Volume Spike";
    default:
      return "Price Breakout";
  }
}

function mapAlertChannelToDb(channel: z.infer<typeof alertChannelSchema>) {
  switch (channel) {
    case "Email":
      return "EMAIL";
    case "SMS":
      return "SMS";
    case "Push":
      return "PUSH";
  }
}

function mapAlertChannelFromDb(channel: string): z.infer<typeof alertChannelSchema> {
  switch (channel) {
    case "EMAIL":
      return "Email";
    case "SMS":
      return "SMS";
    case "PUSH":
      return "Push";
    default:
      return "Email";
  }
}

const createAlertBodySchema = z.object({
  type: alertTypeSchema,
  symbol: z.string().trim().min(1),
  channel: alertChannelSchema,
  trigger: z.string().trim().min(1).max(200),
  destination: z.string().trim().min(3).max(120).optional()
});

const updateAlertBodySchema = z.object({
  status: z.enum(["Active", "Paused"]).optional()
});

async function ensureStock(pool: Pool, symbol: string): Promise<string> {
  const result = await pool.query<{ id: string }>(
    "INSERT INTO stocks(symbol) VALUES ($1) ON CONFLICT (symbol) DO UPDATE SET updated_at = now() RETURNING id",
    [symbol]
  );
  return result.rows[0]!.id;
}

function resolveUser(req: Request, fallbackUserId: string) {
  const user = getAuthUserFromRequest(req, env.JWT_SECRET);
  return { userId: user?.id ?? fallbackUserId, authUser: user };
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function extractThreshold(triggerText: string, fallback: number): number {
  const match = triggerText.match(/-?\d+(\.\d+)?/);
  const parsed = match ? Number(match[0]) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function mapHistoryToIndicatorCandles(items: Array<{ time: string; close: number | null }>) {
  return items
    .filter((item): item is { time: string; close: number } => typeof item.close === "number" && Number.isFinite(item.close))
    .map((item, index, rows) => {
      const prev = rows[Math.max(0, index - 1)]?.close ?? item.close;
      const base = typeof prev === "number" ? prev : item.close;
      return {
        time: item.time,
        open: base,
        high: Math.max(base, item.close),
        low: Math.min(base, item.close),
        close: item.close,
        volume: 0
      };
    });
}

async function evaluateRule(
  deps: { pool: Pool; offlineMarketService: ReturnType<typeof createOfflineMarketService> },
  row: AlertRecord,
  userId: string
) {
  const criteria = (row.criteria ?? {}) as Record<string, unknown>;
  const triggerText = typeof criteria.triggerText === "string" ? criteria.triggerText : "";
  const destination = typeof criteria.destination === "string" ? criteria.destination : null;
  const symbol = row.symbol ?? "";
  if (!symbol || !row.is_enabled) return null;

  const quote = await deps.offlineMarketService.getQuoteWithFallback(symbol);
  const recommendation = await deps.offlineMarketService.getRecommendationWithFallback(symbol);
  const info = quote.quote.reqSymbolInfo ?? {};
  const lastPrice = toNumber(info.lastTradedPrice) ?? 0;
  const changePct = toNumber(info.changePercentage) ?? 0;
  const volume = toNumber((info as Record<string, unknown>).tdyShareVolume) ?? 0;

  let triggered = false;
  let metricValue: number | string = lastPrice;
  switch (row.type) {
    case "PRICE_BREAKOUT": {
      const threshold = extractThreshold(triggerText, lastPrice);
      triggered = lastPrice >= threshold || changePct >= 3;
      metricValue = lastPrice;
      break;
    }
    case "RSI_OVERSOLD":
    case "RSI_OVERBOUGHT": {
      const history = await deps.offlineMarketService.getHistoricalSeries(symbol, 90);
      const candles = mapHistoryToIndicatorCandles(history);
      if (candles.length < 20) return null;
      const indicators = await computeIndicators(candles);
      const rsi = indicators.rsi_14 ?? 50;
      triggered = row.type === "RSI_OVERSOLD" ? rsi <= extractThreshold(triggerText, 30) : rsi >= extractThreshold(triggerText, 70);
      metricValue = rsi;
      break;
    }
    case "VOLUME_SPIKE": {
      const threshold = extractThreshold(triggerText, 1_000_000);
      triggered = volume >= threshold;
      metricValue = volume;
      break;
    }
    case "AI_BUY_SIGNAL":
      triggered = recommendation.action === "BUY";
      metricValue = recommendation.confidence;
      break;
    case "AI_SELL_SIGNAL":
      triggered = recommendation.action === "SELL";
      metricValue = recommendation.confidence;
      break;
  }

  if (!triggered) return null;

  const dbChannel = row.channel;
  const provider =
    dbChannel === "EMAIL" ? "EMAIL_ENGINE" : dbChannel === "SMS" ? "SMS_GATEWAY" : "PUSH_CENTER";
  const message = `${mapAlertTypeFromDb(row.type)} triggered for ${symbol}. Trigger: ${triggerText}. Current metric: ${metricValue}.`;
  const inserted = await deps.pool.query<{ id: string }>(
    `
    INSERT INTO alert_deliveries(alert_id, user_id, channel, destination, status, message, provider, metadata)
    VALUES ($1, $2, $3, $4, 'DELIVERED', $5, $6, $7::jsonb)
    RETURNING id
    `,
    [
      row.id,
      userId,
      dbChannel,
      destination,
      message,
      provider,
      JSON.stringify({ symbol, metricValue, triggerText })
    ]
  );

  await deps.pool.query("UPDATE alerts SET last_triggered_at = now(), updated_at = now() WHERE id = $1", [row.id]);
  await writeAuditLog({
    pool: deps.pool,
    userId,
    action: "ALERT_DELIVERED",
    entityType: "alert",
    entityId: row.id,
    metadata: { symbol, channel: dbChannel, deliveryId: inserted.rows[0]!.id }
  });

  return { id: inserted.rows[0]!.id, message, channel: mapAlertChannelFromDb(dbChannel), symbol };
}

export function createAlertsRouter({ pool, fallbackUserId, offlineMarketService }: Deps): Router {
  const router = Router();

  router.get("/", async (req: Request, res: Response) => {
    try {
      const { userId } = resolveUser(req, fallbackUserId);
      const result = await pool.query<AlertRecord>(
        `
        SELECT a.id, a.type, a.channel, a.is_enabled, a.criteria, s.symbol, a.last_triggered_at
        FROM alerts a
        LEFT JOIN stocks s ON s.id = a.stock_id
        WHERE a.user_id = $1
        ORDER BY a.created_at DESC
        `,
        [userId]
      );

      res.json(
        result.rows.map((row) => {
          const criteria = (row.criteria ?? {}) as Record<string, unknown>;
          const trigger = typeof criteria.triggerText === "string" ? criteria.triggerText : "";
          return {
            id: row.id,
            type: mapAlertTypeFromDb(row.type),
            symbol: row.symbol ?? "",
            channel: mapAlertChannelFromDb(row.channel),
            status: row.is_enabled ? "Active" : "Paused",
            trigger,
            destination: typeof criteria.destination === "string" ? criteria.destination : "",
            lastTriggeredAt: row.last_triggered_at
          };
        })
      );
    } catch (error) {
      res.status(502).json({ error: (error as Error).message });
    }
  });

  router.get("/deliveries", async (req: Request, res: Response) => {
    try {
      const { userId } = resolveUser(req, fallbackUserId);
      const result = await pool.query(
        `
        SELECT d.id, d.channel::text as channel, d.destination, d.status, d.message, d.provider, d.triggered_at,
               s.symbol, a.type::text as type
        FROM alert_deliveries d
        JOIN alerts a ON a.id = d.alert_id
        LEFT JOIN stocks s ON s.id = a.stock_id
        WHERE d.user_id = $1
        ORDER BY d.triggered_at DESC
        LIMIT 50
        `,
        [userId]
      );
      res.json(
        result.rows.map((row: any) => ({
          id: row.id,
          type: mapAlertTypeFromDb(row.type),
          symbol: row.symbol ?? "",
          channel: mapAlertChannelFromDb(row.channel),
          destination: row.destination ?? "",
          status: row.status,
          message: row.message,
          provider: row.provider,
          triggeredAt: row.triggered_at
        }))
      );
    } catch (error) {
      res.status(502).json({ error: (error as Error).message });
    }
  });

  router.post("/evaluate", async (req: Request, res: Response) => {
    try {
      const { userId } = resolveUser(req, fallbackUserId);
      const result = await pool.query<AlertRecord>(
        `
        SELECT a.id, a.type, a.channel, a.is_enabled, a.criteria, s.symbol, a.last_triggered_at
        FROM alerts a
        LEFT JOIN stocks s ON s.id = a.stock_id
        WHERE a.user_id = $1 AND a.is_enabled = true
        ORDER BY a.created_at DESC
        `,
        [userId]
      );

      const deliveries = [];
      for (const row of result.rows) {
        const delivery = await evaluateRule({ pool, offlineMarketService }, row, userId);
        if (delivery) deliveries.push(delivery);
      }

      res.json({ evaluated: result.rows.length, deliveries });
    } catch (error) {
      res.status(502).json({ error: (error as Error).message });
    }
  });

  router.post("/", async (req: Request, res: Response) => {
    try {
      const { userId } = resolveUser(req, fallbackUserId);
      const body = createAlertBodySchema.parse(req.body);
      const stockId = await ensureStock(pool, body.symbol);
      const dbType = mapAlertTypeToDb(body.type);
      const dbChannel = mapAlertChannelToDb(body.channel);
      const criteria = { triggerText: body.trigger, destination: body.destination ?? null };

      const created = await pool.query<{ id: string }>(
        `
        INSERT INTO alerts(user_id, stock_id, type, channel, criteria, is_enabled)
        VALUES ($1, $2, $3, $4, $5::jsonb, true)
        RETURNING id
        `,
        [userId, stockId, dbType, dbChannel, JSON.stringify(criteria)]
      );
      await writeAuditLog({
        pool,
        userId,
        action: "ALERT_CREATED",
        entityType: "alert",
        entityId: created.rows[0]!.id,
        metadata: { symbol: body.symbol, type: body.type, channel: body.channel }
      });

      res.status(201).json({ id: created.rows[0]!.id });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  router.patch("/:id", async (req: Request, res: Response) => {
    try {
      const { userId } = resolveUser(req, fallbackUserId);
      const id = z.string().uuid().parse(req.params.id);
      const body = updateAlertBodySchema.parse(req.body ?? {});

      if (body.status) {
        const enabled = body.status === "Active";
        await pool.query("UPDATE alerts SET is_enabled = $1, updated_at = now() WHERE id = $2 AND user_id = $3", [
          enabled,
          id,
          userId
        ]);
      } else {
        await pool.query("UPDATE alerts SET is_enabled = NOT is_enabled, updated_at = now() WHERE id = $1 AND user_id = $2", [
          id,
          userId
        ]);
      }
      await writeAuditLog({
        pool,
        userId,
        action: "ALERT_UPDATED",
        entityType: "alert",
        entityId: id,
        metadata: { status: body.status ?? "toggled" }
      });

      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  router.delete("/:id", async (req: Request, res: Response) => {
    try {
      const { userId } = resolveUser(req, fallbackUserId);
      const id = z.string().uuid().parse(req.params.id);
      await pool.query("DELETE FROM alerts WHERE id = $1 AND user_id = $2", [id, userId]);
      await writeAuditLog({
        pool,
        userId,
        action: "ALERT_DELETED",
        entityType: "alert",
        entityId: id,
        metadata: {}
      });
      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  return router;
}
