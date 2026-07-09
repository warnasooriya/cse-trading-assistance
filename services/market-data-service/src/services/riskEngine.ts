import type { Pool } from "pg";
import type { createOfflineMarketService } from "./offlineMarketService.js";
import { writeAuditLog } from "./auditService.js";

type OfflineMarketService = ReturnType<typeof createOfflineMarketService>;

export type RiskLimits = {
  id: string;
  userId: string;
  maxPositionPctOfPortfolio: number;
  maxPortfolioExposurePct: number;
  maxDailyLossPct: number;
  maxOpenPositions: number;
  defaultStopLossPct: number;
  defaultTakeProfitPct: number;
  tradingHalted: boolean;
  tradingHaltedReason: string | null;
  tradingHaltedAt: string | null;
};

type RiskLimitsRow = {
  id: string;
  user_id: string;
  max_position_pct_of_portfolio: string;
  max_portfolio_exposure_pct: string;
  max_daily_loss_pct: string;
  max_open_positions: number;
  default_stop_loss_pct: string;
  default_take_profit_pct: string;
  trading_halted: boolean;
  trading_halted_reason: string | null;
  trading_halted_at: string | null;
  daily_loss_baseline_value: string | null;
  daily_loss_baseline_date: string | null;
};

function numeric(value: string | number | null | undefined): number {
  if (typeof value === "number") return value;
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toRiskLimits(row: RiskLimitsRow): RiskLimits {
  return {
    id: row.id,
    userId: row.user_id,
    maxPositionPctOfPortfolio: numeric(row.max_position_pct_of_portfolio),
    maxPortfolioExposurePct: numeric(row.max_portfolio_exposure_pct),
    maxDailyLossPct: numeric(row.max_daily_loss_pct),
    maxOpenPositions: row.max_open_positions,
    defaultStopLossPct: numeric(row.default_stop_loss_pct),
    defaultTakeProfitPct: numeric(row.default_take_profit_pct),
    tradingHalted: row.trading_halted,
    tradingHaltedReason: row.trading_halted_reason,
    tradingHaltedAt: row.trading_halted_at
  };
}

export async function getOrCreateRiskLimits(pool: Pool, userId: string): Promise<RiskLimits> {
  const result = await pool.query<RiskLimitsRow>(
    `
    INSERT INTO risk_limits(user_id)
    VALUES ($1)
    ON CONFLICT (user_id) DO UPDATE SET updated_at = risk_limits.updated_at
    RETURNING *
    `,
    [userId]
  );
  return toRiskLimits(result.rows[0]!);
}

export async function updateRiskLimits(
  pool: Pool,
  userId: string,
  patch: Partial<{
    maxPositionPctOfPortfolio: number;
    maxPortfolioExposurePct: number;
    maxDailyLossPct: number;
    maxOpenPositions: number;
    defaultStopLossPct: number;
    defaultTakeProfitPct: number;
  }>
): Promise<RiskLimits> {
  await getOrCreateRiskLimits(pool, userId);
  const result = await pool.query<RiskLimitsRow>(
    `
    UPDATE risk_limits SET
      max_position_pct_of_portfolio = COALESCE($2, max_position_pct_of_portfolio),
      max_portfolio_exposure_pct = COALESCE($3, max_portfolio_exposure_pct),
      max_daily_loss_pct = COALESCE($4, max_daily_loss_pct),
      max_open_positions = COALESCE($5, max_open_positions),
      default_stop_loss_pct = COALESCE($6, default_stop_loss_pct),
      default_take_profit_pct = COALESCE($7, default_take_profit_pct),
      updated_at = now()
    WHERE user_id = $1
    RETURNING *
    `,
    [
      userId,
      patch.maxPositionPctOfPortfolio ?? null,
      patch.maxPortfolioExposurePct ?? null,
      patch.maxDailyLossPct ?? null,
      patch.maxOpenPositions ?? null,
      patch.defaultStopLossPct ?? null,
      patch.defaultTakeProfitPct ?? null
    ]
  );
  return toRiskLimits(result.rows[0]!);
}

export async function recordRiskEvent(params: {
  pool: Pool;
  userId: string;
  eventType: string;
  symbol?: string | null;
  details?: Record<string, unknown>;
}): Promise<void> {
  await params.pool.query(
    `
    INSERT INTO risk_events(user_id, event_type, symbol, details)
    VALUES ($1, $2, $3, $4::jsonb)
    `,
    [params.userId, params.eventType, params.symbol ?? null, JSON.stringify(params.details ?? {})]
  );
}

async function getPricedHoldings(
  pool: Pool,
  offlineMarketService: OfflineMarketService,
  portfolioId: string
): Promise<Array<{ symbol: string; quantity: number; marketValue: number }>> {
  const result = await pool.query<{ symbol: string; quantity: string; average_cost: string; last_price: string | null }>(
    `
    SELECT s.symbol, h.quantity::text, h.average_cost::text, s.last_price::text
    FROM holdings h
    JOIN stocks s ON s.id = h.stock_id
    WHERE h.portfolio_id = $1
    `,
    [portfolioId]
  );

  const priced = await Promise.all(
    result.rows.map(async (row) => {
      const quantity = numeric(row.quantity);
      let price = numeric(row.last_price);
      try {
        const quote = await offlineMarketService.getQuoteWithFallback(row.symbol);
        const info = quote.quote.reqSymbolInfo ?? {};
        const quoted = numeric((info as any).lastTradedPrice);
        if (quoted > 0) price = quoted;
      } catch {
        if (price <= 0) price = numeric(row.average_cost);
      }
      return { symbol: row.symbol, quantity, marketValue: quantity * price };
    })
  );
  return priced;
}

async function refreshDailyLossBaseline(
  pool: Pool,
  userId: string,
  currentPortfolioValue: number
): Promise<{ baselineValue: number; dailyPnlPct: number }> {
  const today = new Date().toISOString().slice(0, 10);
  const existing = await pool.query<{ daily_loss_baseline_value: string | null; daily_loss_baseline_date: string | null }>(
    "SELECT daily_loss_baseline_value, daily_loss_baseline_date::text AS daily_loss_baseline_date FROM risk_limits WHERE user_id = $1",
    [userId]
  );
  const row = existing.rows[0];
  const baselineDate = row?.daily_loss_baseline_date ? row.daily_loss_baseline_date.slice(0, 10) : null;

  if (!row || baselineDate !== today) {
    await pool.query(
      `
      UPDATE risk_limits
      SET daily_loss_baseline_value = $2, daily_loss_baseline_date = $3, updated_at = now()
      WHERE user_id = $1
      `,
      [userId, currentPortfolioValue, today]
    );
    return { baselineValue: currentPortfolioValue, dailyPnlPct: 0 };
  }

  const baselineValue = numeric(row.daily_loss_baseline_value);
  const dailyPnlPct = baselineValue > 0 ? ((currentPortfolioValue - baselineValue) / baselineValue) * 100 : 0;
  return { baselineValue, dailyPnlPct };
}

export type RiskCheckResult = {
  passed: boolean;
  blockedBy: string[];
  warnings: string[];
  portfolioValue: number;
  projectedPositionPct: number;
  projectedExposurePct: number;
  dailyPnlPct: number;
};

export async function evaluateOrderAgainstRisk(params: {
  pool: Pool;
  offlineMarketService: OfflineMarketService;
  userId: string;
  portfolioId: string;
  cashBalance: number;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  estimatedPrice: number;
}): Promise<RiskCheckResult> {
  const { pool, offlineMarketService, userId, portfolioId, cashBalance, symbol, side, quantity, estimatedPrice } = params;
  const limits = await getOrCreateRiskLimits(pool, userId);
  const blockedBy: string[] = [];
  const warnings: string[] = [];

  const holdings = await getPricedHoldings(pool, offlineMarketService, portfolioId);
  const investedValue = holdings.reduce((sum, h) => sum + h.marketValue, 0);
  const portfolioValue = investedValue + cashBalance;

  const { dailyPnlPct } = await refreshDailyLossBaseline(pool, userId, portfolioValue);

  if (limits.tradingHalted) {
    blockedBy.push(`Trading is halted: ${limits.tradingHaltedReason ?? "risk limit triggered"}`);
  } else if (dailyPnlPct <= -limits.maxDailyLossPct) {
    await pool.query(
      `
      UPDATE risk_limits
      SET trading_halted = true, trading_halted_reason = $2, trading_halted_at = now(), updated_at = now()
      WHERE user_id = $1
      `,
      [userId, `Daily loss ${dailyPnlPct.toFixed(2)}% exceeded limit of ${limits.maxDailyLossPct}%`]
    );
    await recordRiskEvent({
      pool,
      userId,
      eventType: "DAILY_LOSS_HALT",
      details: { dailyPnlPct, maxDailyLossPct: limits.maxDailyLossPct }
    });
    blockedBy.push(`Daily loss kill switch triggered at ${dailyPnlPct.toFixed(2)}% (limit ${limits.maxDailyLossPct}%)`);
  }

  const orderNotional = quantity * estimatedPrice;
  const existingSymbolValue = holdings.find((h) => h.symbol === symbol)?.marketValue ?? 0;
  const projectedSymbolValue = side === "BUY" ? existingSymbolValue + orderNotional : Math.max(0, existingSymbolValue - orderNotional);
  const projectedPortfolioValue = side === "BUY" ? portfolioValue : portfolioValue;
  const projectedPositionPct = projectedPortfolioValue > 0 ? (projectedSymbolValue / projectedPortfolioValue) * 100 : 0;
  const projectedInvestedValue = side === "BUY" ? investedValue + orderNotional : Math.max(0, investedValue - orderNotional);
  const projectedExposurePct = projectedPortfolioValue > 0 ? (projectedInvestedValue / projectedPortfolioValue) * 100 : 0;

  if (side === "BUY") {
    if (projectedPositionPct > limits.maxPositionPctOfPortfolio) {
      blockedBy.push(
        `Position would reach ${projectedPositionPct.toFixed(1)}% of portfolio, exceeding the ${limits.maxPositionPctOfPortfolio}% per-symbol cap`
      );
    }
    if (projectedExposurePct > limits.maxPortfolioExposurePct) {
      blockedBy.push(
        `Total exposure would reach ${projectedExposurePct.toFixed(1)}%, exceeding the ${limits.maxPortfolioExposurePct}% portfolio exposure cap`
      );
    }
    const isNewPosition = existingSymbolValue === 0;
    if (isNewPosition && holdings.length >= limits.maxOpenPositions) {
      blockedBy.push(`Opening a new position would exceed the maximum of ${limits.maxOpenPositions} open positions`);
    }
  }

  const passed = blockedBy.length === 0;
  if (!passed) {
    await recordRiskEvent({
      pool,
      userId,
      eventType: side === "BUY" ? "POSITION_CAP_BLOCKED" : "EXPOSURE_CAP_BLOCKED",
      symbol,
      details: { blockedBy, projectedPositionPct, projectedExposurePct, side, quantity, estimatedPrice }
    });
  }

  return { passed, blockedBy, warnings, portfolioValue, projectedPositionPct, projectedExposurePct, dailyPnlPct };
}

export async function resetKillSwitch(pool: Pool, userId: string): Promise<RiskLimits> {
  await getOrCreateRiskLimits(pool, userId);
  const result = await pool.query<RiskLimitsRow>(
    `
    UPDATE risk_limits
    SET trading_halted = false, trading_halted_reason = NULL, trading_halted_at = NULL, updated_at = now()
    WHERE user_id = $1
    RETURNING *
    `,
    [userId]
  );
  await recordRiskEvent({ pool, userId, eventType: "MANUAL_OVERRIDE", details: { action: "kill_switch_reset" } });
  await writeAuditLog({ pool, userId, action: "RISK_KILL_SWITCH_RESET", entityType: "risk_limits" });
  return toRiskLimits(result.rows[0]!);
}

export async function getRiskStatus(params: {
  pool: Pool;
  offlineMarketService: OfflineMarketService;
  userId: string;
  portfolioId: string;
  cashBalance: number;
}): Promise<{
  limits: RiskLimits;
  portfolioValue: number;
  investedValue: number;
  exposurePct: number;
  largestPositionPct: number;
  openPositions: number;
  dailyPnlPct: number;
}> {
  const { pool, offlineMarketService, userId, portfolioId, cashBalance } = params;
  const limits = await getOrCreateRiskLimits(pool, userId);
  const holdings = await getPricedHoldings(pool, offlineMarketService, portfolioId);
  const investedValue = holdings.reduce((sum, h) => sum + h.marketValue, 0);
  const portfolioValue = investedValue + cashBalance;
  const largestPositionValue = holdings.length ? Math.max(...holdings.map((h) => h.marketValue)) : 0;
  const { dailyPnlPct } = await refreshDailyLossBaseline(pool, userId, portfolioValue);

  return {
    limits,
    portfolioValue,
    investedValue,
    exposurePct: portfolioValue > 0 ? (investedValue / portfolioValue) * 100 : 0,
    largestPositionPct: portfolioValue > 0 ? (largestPositionValue / portfolioValue) * 100 : 0,
    openPositions: holdings.length,
    dailyPnlPct
  };
}
