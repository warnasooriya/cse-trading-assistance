import { createRequire } from "module";
const require = createRequire(import.meta.url);
const jwt = require("jsonwebtoken");
export function signAccessToken(payload, options) {
    return jwt.sign({ sub: payload.id, email: payload.email, role: payload.role }, options.secret, { expiresIn: options.expiresIn });
}
export function getAuthUserFromRequest(req, secret) {
    const header = req.headers.authorization;
    if (!header)
        return null;
    const [kind, token] = header.split(" ");
    if (kind !== "Bearer" || !token)
        return null;
    try {
        const decoded = jwt.verify(token, secret);
        const id = typeof decoded.sub === "string" ? decoded.sub : null;
        if (!id)
            return null;
        return {
            id,
            email: typeof decoded.email === "string" ? decoded.email : null,
            role: typeof decoded.role === "string" ? decoded.role : null
        };
    }
    catch {
        return null;
    }
}
export function requireUserId(req, secret) {
    const user = getAuthUserFromRequest(req, secret);
    if (!user) {
        throw new Error("Unauthorized");
    }
    return user.id;
}
