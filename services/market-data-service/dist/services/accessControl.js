import { getAuthUserFromRequest } from "../auth.js";
import { env } from "../serverEnv.js";
export function requireAuthUser(req) {
    const user = getAuthUserFromRequest(req, env.JWT_SECRET);
    if (!user?.id) {
        throw new Error("Unauthorized");
    }
    return user;
}
export function requireRole(req, roles) {
    const user = requireAuthUser(req);
    const currentRole = (user.role ?? "TRADER");
    if (!roles.includes(currentRole)) {
        throw new Error("Forbidden");
    }
    return user;
}
