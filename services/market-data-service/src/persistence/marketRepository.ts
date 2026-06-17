import type { Pool } from "pg";

export type StoredMarketRow = {
  id: number | null;
  name: string;
  symbol: string;
  price: number | null;
  previousClose: number | null;
  change: number | null;
  changePercentage: number | null;
  high: number | null;
  low: number | null;
  open: number | null;
  sharevolume: number | null;
  tradevolume: number | null;
  turnover: number | null;
  marketCap: number | null;
  lastTradedTime: number | null;
  status: number | null;
};

export type StoredQuote = {
  reqSymbolInfo: {
    symbol: string;
    name: string | null;
    lastTradedPrice: number | null;
    previousClose: number | null;
    change: number | null;
    changePercentage: number | null;
    hiTrade: number | null;
    lowTrade: number | null;
    open: number | null;
    p12HiPrice: number | null;
    p12LowPrice: number | null;
    tdyShareVolume: number | null;
    marketCap: number | null;
  };
};

type MarketWatchQuery = {
  q?: string;
  sortBy: "symbol" | "name" | "price" | "changePercentage" | "sharevolume" | "turnover" | "marketCap";
  sortDir: "asc" | "desc";
  limit: number;
  offset: number;
};

const ORDER_BY_SQL: Record<MarketWatchQuery["sortBy"], string> = {
  symbol: "symbol",
  name: "name",
  price: "price",
  changePercentage: "change_percentage",
  sharevolume: "sharevolume",
  turnover: "turnover",
  marketCap: "market_cap"
};

function fromDbNumeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toEpochMs(value: unknown): number | null {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" || typeof value === "number") {
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

export function createMarketRepository(pool: Pool) {
  return {
    saveMarketRows: async (rows: StoredMarketRow[], capturedAt: Date): Promise<void> => {
      for (const row of rows) {
        const stock = await pool.query<{ id: string }>(
          `
          INSERT INTO stocks(
            symbol, name, last_price, previous_close, day_change, change_percentage,
            day_high, day_low, day_open, share_volume, trade_volume, turnover, market_cap, last_traded_at, updated_at
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, now())
          ON CONFLICT (symbol) DO UPDATE SET
            name = COALESCE(EXCLUDED.name, stocks.name),
            last_price = EXCLUDED.last_price,
            previous_close = EXCLUDED.previous_close,
            day_change = EXCLUDED.day_change,
            change_percentage = EXCLUDED.change_percentage,
            day_high = EXCLUDED.day_high,
            day_low = EXCLUDED.day_low,
            day_open = EXCLUDED.day_open,
            share_volume = EXCLUDED.share_volume,
            trade_volume = EXCLUDED.trade_volume,
            turnover = EXCLUDED.turnover,
            market_cap = EXCLUDED.market_cap,
            last_traded_at = EXCLUDED.last_traded_at,
            updated_at = now()
          RETURNING id
          `,
          [
            row.symbol,
            row.name || null,
            row.price,
            row.previousClose,
            row.change,
            row.changePercentage,
            row.high,
            row.low,
            row.open,
            row.sharevolume ? Math.round(row.sharevolume) : null,
            row.tradevolume ? Math.round(row.tradevolume) : null,
            row.turnover,
            row.marketCap,
            capturedAt
          ]
        );

        const stockId = stock.rows[0]?.id;
        if (!stockId) continue;

        await pool.query(
          `
          INSERT INTO historical_prices(time, stock_id, open, high, low, close, volume, vwap, source)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'CSE_LIVE')
          ON CONFLICT (stock_id, time) DO UPDATE SET
            open = EXCLUDED.open,
            high = EXCLUDED.high,
            low = EXCLUDED.low,
            close = EXCLUDED.close,
            volume = EXCLUDED.volume,
            vwap = EXCLUDED.vwap,
            source = EXCLUDED.source
          `,
          [
            capturedAt,
            stockId,
            row.open,
            row.high,
            row.low,
            row.price,
            row.sharevolume ? Math.round(row.sharevolume) : null,
            row.price
          ]
        );
      }
    },

    getMarketWatch: async (query: MarketWatchQuery): Promise<{ total: number; items: StoredMarketRow[] }> => {
      const whereSql = query.q ? `WHERE symbol ILIKE $1 OR name ILIKE $1` : "";
      const params: Array<string | number> = [];
      if (query.q) params.push(`%${query.q}%`);
      const countRes = await pool.query<{ total: string }>(
        `SELECT COUNT(*)::text AS total FROM stocks ${whereSql}`,
        params
      );

      const orderSql = ORDER_BY_SQL[query.sortBy];
      const baseParams = [...params, query.limit, query.offset];
      const itemsRes = await pool.query(
        `
        SELECT
          NULL::int AS id,
          COALESCE(name, symbol) AS name,
          symbol,
          last_price AS price,
          previous_close AS "previousClose",
          day_change AS change,
          change_percentage AS "changePercentage",
          day_high AS high,
          day_low AS low,
          day_open AS open,
          share_volume AS sharevolume,
          trade_volume AS tradevolume,
          turnover,
          market_cap AS "marketCap",
          last_traded_at AS "lastTradedTime",
          CASE WHEN is_active THEN 1 ELSE 0 END AS status
        FROM stocks
        ${whereSql}
        ORDER BY ${orderSql} ${query.sortDir.toUpperCase()}, symbol ASC
        LIMIT $${params.length + 1}
        OFFSET $${params.length + 2}
        `,
        baseParams
      );

      return {
        total: Number(countRes.rows[0]?.total ?? "0"),
        items: itemsRes.rows.map((row: Record<string, unknown>) => ({
          id: null,
          name: String(row.name ?? ""),
          symbol: String(row.symbol ?? ""),
          price: fromDbNumeric(row.price),
          previousClose: fromDbNumeric(row.previousClose),
          change: fromDbNumeric(row.change),
          changePercentage: fromDbNumeric(row.changePercentage),
          high: fromDbNumeric(row.high),
          low: fromDbNumeric(row.low),
          open: fromDbNumeric(row.open),
          sharevolume: fromDbNumeric(row.sharevolume),
          tradevolume: fromDbNumeric(row.tradevolume),
          turnover: fromDbNumeric(row.turnover),
          marketCap: fromDbNumeric(row.marketCap),
          lastTradedTime: toEpochMs(row.lastTradedTime),
          status: fromDbNumeric(row.status)
        }))
      };
    },

    getStoredQuote: async (symbol: string): Promise<StoredQuote | null> => {
      const result = await pool.query(
        `
        SELECT
          symbol,
          name,
          last_price,
          previous_close,
          day_change,
          change_percentage,
          day_high,
          day_low,
          day_open,
          share_volume,
          market_cap
        FROM stocks
        WHERE symbol = $1
        LIMIT 1
        `,
        [symbol]
      );

      const row = result.rows[0] as Record<string, unknown> | undefined;
      if (!row) return null;

      const hiLo = await pool.query(
        `
        SELECT MAX(high)::text AS high_52w, MIN(low)::text AS low_52w
        FROM historical_prices hp
        JOIN stocks s ON s.id = hp.stock_id
        WHERE s.symbol = $1
          AND hp.time >= now() - interval '365 days'
        `,
        [symbol]
      );
      const range = hiLo.rows[0] as Record<string, unknown> | undefined;

      return {
        reqSymbolInfo: {
          symbol: String(row.symbol ?? symbol),
          name: typeof row.name === "string" ? row.name : null,
          lastTradedPrice: fromDbNumeric(row.last_price),
          previousClose: fromDbNumeric(row.previous_close),
          change: fromDbNumeric(row.day_change),
          changePercentage: fromDbNumeric(row.change_percentage),
          hiTrade: fromDbNumeric(row.day_high),
          lowTrade: fromDbNumeric(row.day_low),
          open: fromDbNumeric(row.day_open),
          p12HiPrice: fromDbNumeric(range?.high_52w),
          p12LowPrice: fromDbNumeric(range?.low_52w),
          tdyShareVolume: fromDbNumeric(row.share_volume),
          marketCap: fromDbNumeric(row.market_cap)
        }
      };
    },

    getHistoricalSeries: async (symbol: string, days: number): Promise<Array<{ time: string; close: number | null }>> => {
      const result = await pool.query(
        `
        SELECT hp.time, hp.close
        FROM historical_prices hp
        JOIN stocks s ON s.id = hp.stock_id
        WHERE s.symbol = $1
          AND hp.time >= now() - ($2::text || ' days')::interval
        ORDER BY hp.time ASC
        `,
        [symbol, String(days)]
      );

      return result.rows.map((row: Record<string, unknown>) => ({
        time: new Date(String(row.time)).toISOString(),
        close: fromDbNumeric(row.close)
      }));
    }
  };
}

