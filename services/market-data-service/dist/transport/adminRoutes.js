import { Router } from "express";
import { z } from "zod";
import { requireRole } from "../services/accessControl.js";
import { writeAuditLog } from "../services/auditService.js";
const roleSchema = z.object({
    role: z.enum(["ADMIN", "TRADER", "ANALYST"])
});
export function createAdminRouter({ pool }) {
    const router = Router();
    router.get("/users", async (req, res) => {
        try {
            requireRole(req, ["ADMIN"]);
            const result = await pool.query(`
        SELECT id, email, display_name, role::text as role, preferred_language, created_at, updated_at
        FROM users
        ORDER BY created_at DESC
        `);
            res.json(result.rows);
        }
        catch (error) {
            const message = error.message;
            res.status(message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500).json({ error: message });
        }
    });
    router.patch("/users/:id/role", async (req, res) => {
        try {
            const admin = requireRole(req, ["ADMIN"]);
            const body = roleSchema.parse(req.body);
            const result = await pool.query(`
        UPDATE users
        SET role = $2::user_role, updated_at = now()
        WHERE id = $1
        RETURNING id, email, display_name, role::text as role, preferred_language
        `, [req.params.id, body.role]);
            if (!result.rows[0]) {
                res.status(404).json({ error: "User not found" });
                return;
            }
            await writeAuditLog({
                pool,
                userId: admin.id,
                action: "ADMIN_ROLE_UPDATED",
                entityType: "user",
                entityId: req.params.id,
                metadata: { role: body.role }
            });
            res.json(result.rows[0]);
        }
        catch (error) {
            const message = error.message;
            res.status(message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 400).json({ error: message });
        }
    });
    router.get("/audit-logs", async (req, res) => {
        try {
            requireRole(req, ["ADMIN", "ANALYST"]);
            const result = await pool.query(`
        SELECT id, user_id, action, entity_type, entity_id, metadata, created_at
        FROM audit_logs
        ORDER BY created_at DESC
        LIMIT 250
        `);
            res.json(result.rows);
        }
        catch (error) {
            const message = error.message;
            res.status(message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500).json({ error: message });
        }
    });
    return router;
}
