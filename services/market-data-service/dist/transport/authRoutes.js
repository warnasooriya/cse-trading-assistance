import { Router } from "express";
import { z } from "zod";
import * as bcrypt from "bcryptjs";
import { getAuthUserFromRequest, signAccessToken } from "../auth.js";
import { env } from "../serverEnv.js";
import { writeAuditLog } from "../services/auditService.js";
const registerBodySchema = z.object({
    email: z.string().trim().email(),
    password: z.string().min(8).max(200),
    displayName: z.string().trim().min(1).max(80).optional(),
    preferredLanguage: z.string().trim().min(2).max(10).optional()
});
const loginBodySchema = z.object({
    email: z.string().trim().email(),
    password: z.string().min(1).max(200)
});
const updateProfileBodySchema = z.object({
    displayName: z.string().trim().min(1).max(80).optional(),
    preferredLanguage: z.string().trim().min(2).max(10).optional()
});
export function createAuthRouter({ pool }) {
    const router = Router();
    router.post("/register", async (req, res) => {
        try {
            const body = registerBodySchema.parse(req.body);
            const passwordHash = await bcrypt.hash(body.password, 12);
            const count = await pool.query("SELECT COUNT(*)::text as total FROM users WHERE password_hash IS NOT NULL");
            const isFirstUser = Number(count.rows[0]?.total ?? "0") === 0;
            const role = isFirstUser ? "ADMIN" : "TRADER";
            const inserted = await pool.query(`
        INSERT INTO users(email, display_name, password_hash, preferred_language, role)
        VALUES ($1, $2, $3, $4, $5::user_role)
        RETURNING id, email, display_name, role::text as role, preferred_language
        `, [body.email.toLowerCase(), body.displayName ?? null, passwordHash, body.preferredLanguage ?? "en", role]);
            const user = inserted.rows[0];
            const token = signAccessToken({ id: user.id, email: user.email, role: user.role }, { secret: env.JWT_SECRET, expiresIn: env.JWT_EXPIRES_IN });
            res.status(201).json({
                token,
                user: {
                    id: user.id,
                    email: user.email,
                    displayName: user.display_name,
                    role: user.role,
                    preferredLanguage: user.preferred_language ?? "en"
                }
            });
            await writeAuditLog({
                pool,
                userId: user.id,
                action: "USER_REGISTERED",
                entityType: "user",
                entityId: user.id,
                metadata: { email: user.email }
            });
        }
        catch (error) {
            const message = error.message;
            if (message.toLowerCase().includes("duplicate")) {
                res.status(409).json({ error: "Email already registered" });
                return;
            }
            res.status(400).json({ error: message });
        }
    });
    router.post("/login", async (req, res) => {
        try {
            const body = loginBodySchema.parse(req.body);
            const found = await pool.query(`
        SELECT id, email, display_name, role::text as role, preferred_language, password_hash
        FROM users
        WHERE lower(email) = lower($1)
        LIMIT 1
        `, [body.email]);
            const user = found.rows[0];
            if (!user || !user.password_hash) {
                res.status(401).json({ error: "Invalid credentials" });
                return;
            }
            const ok = await bcrypt.compare(body.password, user.password_hash);
            if (!ok) {
                res.status(401).json({ error: "Invalid credentials" });
                return;
            }
            const token = signAccessToken({ id: user.id, email: user.email, role: user.role }, { secret: env.JWT_SECRET, expiresIn: env.JWT_EXPIRES_IN });
            res.json({
                token,
                user: {
                    id: user.id,
                    email: user.email,
                    displayName: user.display_name,
                    role: user.role,
                    preferredLanguage: user.preferred_language ?? "en"
                }
            });
            await writeAuditLog({
                pool,
                userId: user.id,
                action: "USER_LOGGED_IN",
                entityType: "user",
                entityId: user.id,
                metadata: {}
            });
        }
        catch (error) {
            res.status(400).json({ error: error.message });
        }
    });
    router.get("/me", async (req, res) => {
        try {
            const authUser = getAuthUserFromRequest(req, env.JWT_SECRET);
            if (!authUser) {
                res.status(401).json({ error: "Unauthorized" });
                return;
            }
            const found = await pool.query(`
        SELECT id, email, display_name, role::text as role, preferred_language
        FROM users
        WHERE id = $1
        LIMIT 1
        `, [authUser.id]);
            const user = found.rows[0];
            if (!user) {
                res.status(401).json({ error: "Unauthorized" });
                return;
            }
            res.json({
                id: user.id,
                email: user.email,
                displayName: user.display_name,
                role: user.role,
                preferredLanguage: user.preferred_language ?? "en"
            });
        }
        catch (error) {
            res.status(502).json({ error: error.message });
        }
    });
    router.patch("/me", async (req, res) => {
        try {
            const authUser = getAuthUserFromRequest(req, env.JWT_SECRET);
            if (!authUser) {
                res.status(401).json({ error: "Unauthorized" });
                return;
            }
            const body = updateProfileBodySchema.parse(req.body ?? {});
            const updated = await pool.query(`
        UPDATE users
        SET display_name = COALESCE($2, display_name),
            preferred_language = COALESCE($3, preferred_language),
            updated_at = now()
        WHERE id = $1
        RETURNING id, email, display_name, preferred_language
        `, [authUser.id, body.displayName ?? null, body.preferredLanguage ?? null]);
            res.json({
                id: updated.rows[0].id,
                email: updated.rows[0].email,
                displayName: updated.rows[0].display_name,
                role: authUser.role,
                preferredLanguage: updated.rows[0].preferred_language ?? "en"
            });
            await writeAuditLog({
                pool,
                userId: authUser.id,
                action: "PROFILE_UPDATED",
                entityType: "user",
                entityId: authUser.id,
                metadata: { displayName: body.displayName ?? null, preferredLanguage: body.preferredLanguage ?? null }
            });
        }
        catch (error) {
            res.status(400).json({ error: error.message });
        }
    });
    return router;
}
