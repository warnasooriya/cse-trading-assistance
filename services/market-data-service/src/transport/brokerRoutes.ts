import { Router, type Request, type Response } from "express";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { getAuthUserFromRequest } from "../auth.js";
import { env } from "../serverEnv.js";
import type { createOfflineMarketService } from "../services/offlineMarketService.js";
import { writeAuditLog } from "../services/auditService.js";
import { evaluateOrderAgainstRisk } from "../services/riskEngine.js";

type Deps = {
  pool: Pool;
  offlineMarketService: ReturnType<typeof createOfflineMarketService>;
  portfolioName: string;
};

const DEFAULT_FEE_RATE_PCT = 1.12;

const orderBodySchema = z.object({
  symbol: z.string().trim().min(1),
  side: z.enum(["BUY", "SELL"]),
  type: z.enum(["MARKET", "LIMIT", "STOP"]).default("MARKET"),
  quantity: z.coerce.number().positive(),
  provider: z.string().trim().min(1).optional(),
  limitPrice: z.coerce.number().positive().optional(),
  stopPrice: z.coerce.number().positive().optional()
});

const linkBrokerBodySchema = z.object({
  provider: z.string().trim().min(2),
  accountName: z.string().trim().min(2),
  accountNumber: z.string().trim().min(2),
  endpoint: z.string().url(),
  apiKey: z.string().trim().min(8).optional(),
  isDefault: z.boolean().default(true)
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

async function ensureStock(pool: Pool, symbol: string, name: string | null): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `
    INSERT INTO stocks(symbol, name)
    VALUES ($1, $2)
    ON CONFLICT (symbol) DO UPDATE SET name = COALESCE(EXCLUDED.name, stocks.name), updated_at = now()
    RETURNING id
    `,
    [symbol, name]
  );
  return result.rows[0]!.id;
}

async function ensurePaperAccount(pool: Pool, userId: string) {
  const result = await pool.query<{
    id: string;
    provider: string;
    account_name: string;
    account_number: string;
    cash_balance: string;
    currency: string;
    settings: Record<string, unknown>;
  }>(
    `
    INSERT INTO broker_accounts(user_id, provider, account_name, account_number, cash_balance, is_default)
    VALUES ($1, 'PAPER', 'Paper Trading Account', 'PAPER-001', $2, true)
    ON CONFLICT (user_id, provider) DO UPDATE SET updated_at = now()
    RETURNING id, provider, account_name, account_number, cash_balance, currency, settings
    `,
    [userId, env.PAPER_BROKER_STARTING_CASH]
  );
  return result.rows[0]!;
}

async function getDefaultBrokerAccount(pool: Pool, userId: string, provider?: string) {
  const result = await pool.query<{
    id: string;
    provider: string;
    account_name: string;
    account_number: string;
    cash_balance: string;
    currency: string;
    settings: Record<string, unknown>;
  }>(
    `
    SELECT id, provider, account_name, account_number, cash_balance, currency, settings
    FROM broker_accounts
    WHERE user_id = $1
      AND ($2::text IS NULL OR provider = $2)
    ORDER BY is_default DESC, updated_at DESC
    LIMIT 1
    `,
    [userId, provider ?? null]
  );
  return result.rows[0] ?? null;
}

function numeric(value: string | number | null | undefined): number {
  if (typeof value === "number") return value;
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function getHolding(db: Pool | PoolClient, portfolioId: string, symbol: string) {
  const result = await db.query<{
    id: string;
    quantity: string;
    average_cost: string;
  }>(
    `
    SELECT h.id, h.quantity, h.average_cost
    FROM holdings h
    JOIN stocks s ON s.id = h.stock_id
    WHERE h.portfolio_id = $1 AND s.symbol = $2
    `,
    [portfolioId, symbol]
  );
  return result.rows[0] ?? null;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function createBrokerRouter({ pool, offlineMarketService, portfolioName }: Deps): Router {
  const router = Router();

  router.get("/account", async (req: Request, res: Response) => {
    try {
      const userId = requireUserId(req);
      let account = await getDefaultBrokerAccount(pool, userId);
      if (!account) {
        account = await ensurePaperAccount(pool, userId);
      }
      const linked = await pool.query(
        `
        SELECT id, provider, account_name, account_number, is_default, updated_at
        FROM broker_accounts
        WHERE user_id = $1
        ORDER BY is_default DESC, updated_at DESC
        `,
        [userId]
      );
      const orders = await pool.query(
        `
        SELECT id, symbol, side, order_type, quantity, requested_price, executed_price, fees, status, placed_at, executed_at
        FROM broker_orders
        WHERE user_id = $1
        ORDER BY placed_at DESC
        LIMIT 10
        `,
        [userId]
      );
      res.json({
        provider: account.provider,
        accountName: account.account_name,
        accountNumber: account.account_number,
        cashBalance: numeric(account.cash_balance),
        currency: account.currency,
        linkedAccounts: linked.rows,
        recentOrders: orders.rows
      });
    } catch (error) {
      const message = (error as Error).message;
      res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
    }
  });

  router.post("/preview", async (req: Request, res: Response) => {
    try {
      const body = orderBodySchema.parse(req.body);
      const quote = await offlineMarketService.getQuoteWithFallback(body.symbol);
      const info = quote.quote.reqSymbolInfo ?? {};
      const marketPrice = numeric(info.lastTradedPrice);
      const executionPrice = body.type === "LIMIT" ? body.limitPrice ?? marketPrice : body.type === "STOP" ? body.stopPrice ?? marketPrice : marketPrice;
      const grossAmount = executionPrice * body.quantity;
      const fees = roundMoney(grossAmount * (DEFAULT_FEE_RATE_PCT / 100));
      const netAmount = body.side === "BUY" ? grossAmount + fees : grossAmount - fees;

      res.json({
        symbol: body.symbol,
        side: body.side,
        type: body.type,
        executionPrice,
        grossAmount,
        fees,
        netAmount,
        feeRatePct: DEFAULT_FEE_RATE_PCT
      });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  router.post("/account/link", async (req: Request, res: Response) => {
    try {
      const userId = requireUserId(req);
      const body = linkBrokerBodySchema.parse(req.body);
      if (body.isDefault) {
        await pool.query("UPDATE broker_accounts SET is_default = false, updated_at = now() WHERE user_id = $1", [userId]);
      }
      const result = await pool.query(
        `
        INSERT INTO broker_accounts(user_id, provider, account_name, account_number, cash_balance, is_default, settings)
        VALUES ($1, $2, $3, $4, 0, $5, $6::jsonb)
        ON CONFLICT (user_id, provider) DO UPDATE SET
          account_name = EXCLUDED.account_name,
          account_number = EXCLUDED.account_number,
          is_default = EXCLUDED.is_default,
          settings = EXCLUDED.settings,
          updated_at = now()
        RETURNING id, provider, account_name, account_number, is_default
        `,
        [userId, body.provider, body.accountName, body.accountNumber, body.isDefault, JSON.stringify({ endpoint: body.endpoint, apiKey: body.apiKey ?? null })]
      );
      await writeAuditLog({
        pool,
        userId,
        action: "BROKER_ACCOUNT_LINKED",
        entityType: "broker_account",
        entityId: result.rows[0]!.id,
        metadata: { provider: body.provider, accountNumber: body.accountNumber }
      });
      res.status(201).json(result.rows[0]);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  router.get("/orders", async (req: Request, res: Response) => {
    try {
      const userId = requireUserId(req);
      const orders = await pool.query(
        `
        SELECT id, symbol, side, order_type, quantity, requested_price, executed_price, fees, gross_amount, net_amount, status, broker_order_id, placed_at, executed_at
        FROM broker_orders
        WHERE user_id = $1
        ORDER BY placed_at DESC
        LIMIT 50
        `,
        [userId]
      );
      res.json(orders.rows);
    } catch (error) {
      const message = (error as Error).message;
      res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
    }
  });

  router.post("/orders", async (req: Request, res: Response) => {
    const client = await pool.connect();
    try {
      const userId = requireUserId(req);
      const body = orderBodySchema.parse(req.body);
      const account = (await getDefaultBrokerAccount(pool, userId, body.provider)) ?? (await ensurePaperAccount(pool, userId));
      const portfolioId = await ensureUserPortfolio(pool, userId, portfolioName);
      const quote = await offlineMarketService.getQuoteWithFallback(body.symbol);
      const info = quote.quote.reqSymbolInfo ?? {};
      const marketPrice = numeric(info.lastTradedPrice);
      const executionPrice = body.type === "LIMIT" ? body.limitPrice ?? marketPrice : body.type === "STOP" ? body.stopPrice ?? marketPrice : marketPrice;
      const stockId = await ensureStock(pool, body.symbol, typeof info.name === "string" ? info.name : body.symbol);
      let grossAmount = roundMoney(executionPrice * body.quantity);
      let fees = roundMoney(grossAmount * (DEFAULT_FEE_RATE_PCT / 100));
      let netAmount = body.side === "BUY" ? roundMoney(grossAmount + fees) : roundMoney(grossAmount - fees);
      const cashBalance = numeric(account.cash_balance);

      const riskCheck = await evaluateOrderAgainstRisk({
        pool,
        offlineMarketService,
        userId,
        portfolioId,
        cashBalance,
        symbol: body.symbol,
        side: body.side,
        quantity: body.quantity,
        estimatedPrice: executionPrice
      });
      if (!riskCheck.passed) {
        res.status(422).json({ error: "Risk check failed", blockedBy: riskCheck.blockedBy });
        return;
      }

      if (account.provider !== "PAPER") {
        const endpoint = typeof account.settings?.endpoint === "string" ? account.settings.endpoint : null;
        const apiKey = typeof account.settings?.apiKey === "string" ? account.settings.apiKey : null;
        if (!endpoint) {
          throw new Error(`Linked broker provider ${account.provider} is missing endpoint configuration`);
        }
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
          },
          body: JSON.stringify({
            symbol: body.symbol,
            side: body.side,
            type: body.type,
            quantity: body.quantity,
            limitPrice: body.limitPrice ?? null,
            stopPrice: body.stopPrice ?? null,
            marketPrice
          })
        });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(`External broker rejected order: ${text.slice(0, 200)}`);
        }
        const payload = (await response.json()) as {
          status?: string;
          brokerOrderId?: string;
          executedPrice?: number;
          grossAmount?: number;
          fees?: number;
          netAmount?: number;
        };
        grossAmount = typeof payload.grossAmount === "number" ? payload.grossAmount : grossAmount;
        fees = typeof payload.fees === "number" ? payload.fees : fees;
        netAmount = typeof payload.netAmount === "number" ? payload.netAmount : netAmount;
      }

      await client.query("BEGIN");

      if (account.provider === "PAPER" && body.side === "BUY" && cashBalance < netAmount) {
        throw new Error("Insufficient paper broker cash balance");
      }

      const holding = await getHolding(client, portfolioId, body.symbol);
      if (body.side === "SELL") {
        const currentQty = numeric(holding?.quantity);
        if (currentQty < body.quantity) {
          throw new Error("Not enough shares available to sell");
        }
      }

      if (body.side === "BUY") {
        const existingQty = numeric(holding?.quantity);
        const existingAvg = numeric(holding?.average_cost);
        const nextQty = existingQty + body.quantity;
        const combinedCost = existingQty * existingAvg + netAmount;
        const nextAverageCost = nextQty > 0 ? combinedCost / nextQty : 0;

        await client.query(
          `
          INSERT INTO holdings(portfolio_id, stock_id, quantity, average_cost, buy_commission, sell_commission_rate)
          VALUES ($1, $2, $3, $4, 0, $5)
          ON CONFLICT (portfolio_id, stock_id) DO UPDATE SET
            quantity = EXCLUDED.quantity + holdings.quantity,
            average_cost = $4,
            updated_at = now()
          `,
          [portfolioId, stockId, body.quantity, nextAverageCost, DEFAULT_FEE_RATE_PCT]
        );

        if (account.provider === "PAPER") {
          await client.query("UPDATE broker_accounts SET cash_balance = cash_balance - $1, updated_at = now() WHERE id = $2", [netAmount, account.id]);
        }
      } else {
        const existingQty = numeric(holding?.quantity);
        const remainingQty = existingQty - body.quantity;
        if (remainingQty <= 0) {
          await client.query("DELETE FROM holdings WHERE id = $1", [holding!.id]);
        } else {
          await client.query("UPDATE holdings SET quantity = $1, updated_at = now() WHERE id = $2", [remainingQty, holding!.id]);
        }

        if (account.provider === "PAPER") {
          await client.query("UPDATE broker_accounts SET cash_balance = cash_balance + $1, updated_at = now() WHERE id = $2", [netAmount, account.id]);
        }
      }

      await client.query(
        `
        INSERT INTO transactions(portfolio_id, stock_id, side, quantity, price, fees, executed_at, notes)
        VALUES ($1, $2, $3, $4, $5, $6, now(), $7)
        `,
        [portfolioId, stockId, body.side, body.quantity, executionPrice, fees, "Paper broker execution"]
      );

      const orderId = `${account.provider}-${Date.now()}`;
      const orderInsert = await client.query<{ id: string }>(
        `
        INSERT INTO broker_orders(
          user_id, broker_account_id, portfolio_id, stock_id, symbol, side, order_type, quantity,
          requested_price, executed_price, fees, gross_amount, net_amount, status, broker_order_id, raw, executed_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'FILLED', $14, $15::jsonb, now())
        RETURNING id
        `,
        [
          userId,
          account.id,
          portfolioId,
          stockId,
          body.symbol,
          body.side,
          body.type,
          body.quantity,
          body.limitPrice ?? body.stopPrice ?? marketPrice,
          executionPrice,
          fees,
          grossAmount,
          netAmount,
          orderId,
          JSON.stringify({ marketPrice, provider: account.provider })
        ]
      );

      await client.query("COMMIT");
      await writeAuditLog({
        pool,
        userId,
        action: "BROKER_ORDER_PLACED",
        entityType: "broker_order",
        entityId: orderInsert.rows[0]!.id,
        metadata: { symbol: body.symbol, side: body.side, provider: account.provider, quantity: body.quantity }
      });
      res.status(201).json({
        id: orderInsert.rows[0]!.id,
        brokerOrderId: orderId,
        status: "FILLED",
        executionPrice,
        grossAmount,
        fees,
        netAmount
      });
    } catch (error) {
      await client.query("ROLLBACK");
      const message = (error as Error).message;
      res.status(message === "Unauthorized" ? 401 : 400).json({ error: message });
    } finally {
      client.release();
    }
  });

  return router;
}
