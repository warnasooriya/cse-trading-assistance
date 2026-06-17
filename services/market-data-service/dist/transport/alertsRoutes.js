import { Router } from "express";
import { z } from "zod";
import { getAuthUserFromRequest } from "../auth.js";
import { env } from "../serverEnv.js";
const alertTypeSchema = z.enum([
    "AI Buy Signal",
    "AI Sell Signal",
    "Price Breakout",
    "RSI Oversold",
    "RSI Overbought",
    "Volume Spike"
]);
const alertChannelSchema = z.enum(["Email", "SMS", "Push"]);
function mapAlertTypeToDb(type) {
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
function mapAlertTypeFromDb(type) {
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
function mapAlertChannelToDb(channel) {
    switch (channel) {
        case "Email":
            return "EMAIL";
        case "SMS":
            return "SMS";
        case "Push":
            return "PUSH";
    }
}
function mapAlertChannelFromDb(channel) {
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
    trigger: z.string().trim().min(1).max(200)
});
const updateAlertBodySchema = z.object({
    status: z.enum(["Active", "Paused"]).optional()
});
async function ensureStock(pool, symbol) {
    const result = await pool.query("INSERT INTO stocks(symbol) VALUES ($1) ON CONFLICT (symbol) DO UPDATE SET updated_at = now() RETURNING id", [symbol]);
    return result.rows[0].id;
}
function resolveUserId(req, fallbackUserId) {
    const user = getAuthUserFromRequest(req, env.JWT_SECRET);
    return user?.id ?? fallbackUserId;
}
export function createAlertsRouter({ pool, fallbackUserId }) {
    const router = Router();
    router.get("/", async (req, res) => {
        try {
            const userId = resolveUserId(req, fallbackUserId);
            const result = await pool.query(`
        SELECT a.id, a.type, a.channel, a.is_enabled, a.criteria, s.symbol
        FROM alerts a
        LEFT JOIN stocks s ON s.id = a.stock_id
        WHERE a.user_id = $1
        ORDER BY a.created_at DESC
        `, [userId]);
            res.json(result.rows.map((row) => {
                const criteria = (row.criteria ?? {});
                const trigger = typeof criteria.triggerText === "string" ? criteria.triggerText : "";
                return {
                    id: row.id,
                    type: mapAlertTypeFromDb(row.type),
                    symbol: row.symbol ?? "",
                    channel: mapAlertChannelFromDb(row.channel),
                    status: row.is_enabled ? "Active" : "Paused",
                    trigger
                };
            }));
        }
        catch (error) {
            res.status(502).json({ error: error.message });
        }
    });
    router.post("/", async (req, res) => {
        try {
            const userId = resolveUserId(req, fallbackUserId);
            const body = createAlertBodySchema.parse(req.body);
            const stockId = await ensureStock(pool, body.symbol);
            const dbType = mapAlertTypeToDb(body.type);
            const dbChannel = mapAlertChannelToDb(body.channel);
            const criteria = { triggerText: body.trigger };
            const created = await pool.query(`
        INSERT INTO alerts(user_id, stock_id, type, channel, criteria, is_enabled)
        VALUES ($1, $2, $3, $4, $5::jsonb, true)
        RETURNING id
        `, [userId, stockId, dbType, dbChannel, JSON.stringify(criteria)]);
            res.status(201).json({ id: created.rows[0].id });
        }
        catch (error) {
            res.status(400).json({ error: error.message });
        }
    });
    router.patch("/:id", async (req, res) => {
        try {
            const userId = resolveUserId(req, fallbackUserId);
            const id = z.string().uuid().parse(req.params.id);
            const body = updateAlertBodySchema.parse(req.body ?? {});
            if (body.status) {
                const enabled = body.status === "Active";
                await pool.query("UPDATE alerts SET is_enabled = $1, updated_at = now() WHERE id = $2 AND user_id = $3", [
                    enabled,
                    id,
                    userId
                ]);
            }
            else {
                await pool.query("UPDATE alerts SET is_enabled = NOT is_enabled, updated_at = now() WHERE id = $1 AND user_id = $2", [
                    id,
                    userId
                ]);
            }
            res.json({ ok: true });
        }
        catch (error) {
            res.status(400).json({ error: error.message });
        }
    });
    router.delete("/:id", async (req, res) => {
        try {
            const userId = resolveUserId(req, fallbackUserId);
            const id = z.string().uuid().parse(req.params.id);
            await pool.query("DELETE FROM alerts WHERE id = $1 AND user_id = $2", [id, userId]);
            res.json({ ok: true });
        }
        catch (error) {
            res.status(400).json({ error: error.message });
        }
    });
    return router;
}
