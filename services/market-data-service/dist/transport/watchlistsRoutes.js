import { Router } from "express";
import { z } from "zod";
import { env } from "../serverEnv.js";
import { getAuthUserFromRequest } from "../auth.js";
const createWatchlistBodySchema = z.object({
    name: z.string().trim().min(1).max(60)
});
const addItemBodySchema = z.object({
    symbol: z.string().trim().min(1),
    name: z.string().trim().min(1).optional()
});
function resolveUserId(req, fallbackUserId) {
    const user = getAuthUserFromRequest(req, env.JWT_SECRET);
    return user?.id ?? fallbackUserId;
}
async function ensureStock(pool, symbol, name) {
    const result = await pool.query(`
    INSERT INTO stocks(symbol, name)
    VALUES ($1, $2)
    ON CONFLICT (symbol) DO UPDATE SET name = COALESCE(EXCLUDED.name, stocks.name), updated_at = now()
    RETURNING id
    `, [symbol, name]);
    return result.rows[0].id;
}
export function createWatchlistsRouter({ pool, fallbackUserId }) {
    const router = Router();
    router.get("/", async (req, res) => {
        try {
            const userId = resolveUserId(req, fallbackUserId);
            const watchlists = await pool.query(`
        SELECT id, name
        FROM watchlists
        WHERE user_id = $1
        ORDER BY updated_at DESC
        `, [userId]);
            const items = await pool.query(`
        SELECT wi.watchlist_id, s.symbol, s.name
        FROM watchlist_items wi
        JOIN stocks s ON s.id = wi.stock_id
        WHERE wi.watchlist_id = ANY($1::uuid[])
        ORDER BY s.symbol ASC
        `, [watchlists.rows.map((w) => w.id)]);
            const itemsByList = new Map();
            for (const row of items.rows) {
                const current = itemsByList.get(row.watchlist_id) ?? [];
                current.push({ symbol: row.symbol, name: row.name ?? row.symbol });
                itemsByList.set(row.watchlist_id, current);
            }
            res.json(watchlists.rows.map((w) => ({
                id: w.id,
                name: w.name,
                items: itemsByList.get(w.id) ?? []
            })));
        }
        catch (error) {
            res.status(502).json({ error: error.message });
        }
    });
    router.post("/", async (req, res) => {
        try {
            const userId = resolveUserId(req, fallbackUserId);
            const body = createWatchlistBodySchema.parse(req.body);
            const created = await pool.query(`
        INSERT INTO watchlists(user_id, name)
        VALUES ($1, $2)
        RETURNING id
        `, [userId, body.name]);
            res.status(201).json({ id: created.rows[0].id });
        }
        catch (error) {
            const message = error.message;
            if (message.toLowerCase().includes("duplicate")) {
                res.status(409).json({ error: "Watchlist name already exists" });
                return;
            }
            res.status(400).json({ error: message });
        }
    });
    router.delete("/:id", async (req, res) => {
        try {
            const userId = resolveUserId(req, fallbackUserId);
            const id = z.string().uuid().parse(req.params.id);
            await pool.query("DELETE FROM watchlists WHERE id = $1 AND user_id = $2", [id, userId]);
            res.json({ ok: true });
        }
        catch (error) {
            res.status(400).json({ error: error.message });
        }
    });
    router.post("/:id/items", async (req, res) => {
        try {
            const userId = resolveUserId(req, fallbackUserId);
            const watchlistId = z.string().uuid().parse(req.params.id);
            const body = addItemBodySchema.parse(req.body);
            const owns = await pool.query("SELECT id FROM watchlists WHERE id = $1 AND user_id = $2", [watchlistId, userId]);
            if (!owns.rows[0]) {
                res.status(404).json({ error: "Watchlist not found" });
                return;
            }
            const stockId = await ensureStock(pool, body.symbol, body.name ?? null);
            await pool.query(`
        INSERT INTO watchlist_items(watchlist_id, stock_id)
        VALUES ($1, $2)
        ON CONFLICT (watchlist_id, stock_id) DO NOTHING
        `, [watchlistId, stockId]);
            res.status(201).json({ ok: true });
        }
        catch (error) {
            res.status(400).json({ error: error.message });
        }
    });
    router.delete("/:id/items/:symbol", async (req, res) => {
        try {
            const userId = resolveUserId(req, fallbackUserId);
            const watchlistId = z.string().uuid().parse(req.params.id);
            const symbol = z.string().trim().min(1).parse(req.params.symbol);
            const owns = await pool.query("SELECT id FROM watchlists WHERE id = $1 AND user_id = $2", [watchlistId, userId]);
            if (!owns.rows[0]) {
                res.status(404).json({ error: "Watchlist not found" });
                return;
            }
            const stock = await pool.query("SELECT id FROM stocks WHERE symbol = $1", [symbol]);
            const stockId = stock.rows[0]?.id;
            if (stockId) {
                await pool.query("DELETE FROM watchlist_items WHERE watchlist_id = $1 AND stock_id = $2", [watchlistId, stockId]);
            }
            res.json({ ok: true });
        }
        catch (error) {
            res.status(400).json({ error: error.message });
        }
    });
    return router;
}
