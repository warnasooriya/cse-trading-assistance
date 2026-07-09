export async function writeAuditLog(params) {
    await params.pool.query(`
    INSERT INTO audit_logs(user_id, action, entity_type, entity_id, metadata)
    VALUES ($1, $2, $3, $4, $5::jsonb)
    `, [
        params.userId ?? null,
        params.action,
        params.entityType ?? null,
        params.entityId ?? null,
        JSON.stringify(params.metadata ?? {})
    ]);
}
