import type { Request } from "express";
import { createRequire } from "module";
import type { Secret, SignOptions } from "jsonwebtoken";

const require = createRequire(import.meta.url);
const jwt: typeof import("jsonwebtoken") = require("jsonwebtoken");

export type AuthUser = {
  id: string;
  email: string | null;
  role: string | null;
};

export function signAccessToken(
  payload: AuthUser,
  options: { secret: Secret; expiresIn: SignOptions["expiresIn"] }
): string {
  return jwt.sign(
    { sub: payload.id, email: payload.email, role: payload.role },
    options.secret,
    { expiresIn: options.expiresIn }
  );
}

export function getAuthUserFromRequest(req: Request, secret: string): AuthUser | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [kind, token] = header.split(" ");
  if (kind !== "Bearer" || !token) return null;
  try {
    const decoded = jwt.verify(token, secret) as { sub?: unknown; email?: unknown; role?: unknown };
    const id = typeof decoded.sub === "string" ? decoded.sub : null;
    if (!id) return null;
    return {
      id,
      email: typeof decoded.email === "string" ? decoded.email : null,
      role: typeof decoded.role === "string" ? decoded.role : null
    };
  } catch {
    return null;
  }
}

export function requireUserId(req: Request, secret: string): string {
  const user = getAuthUserFromRequest(req, secret);
  if (!user) {
    throw new Error("Unauthorized");
  }
  return user.id;
}
