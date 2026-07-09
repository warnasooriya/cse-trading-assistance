import type { Request } from "express";
import { getAuthUserFromRequest } from "../auth.js";
import { env } from "../serverEnv.js";

export type AppRole = "ADMIN" | "TRADER" | "ANALYST";

export function requireAuthUser(req: Request) {
  const user = getAuthUserFromRequest(req, env.JWT_SECRET);
  if (!user?.id) {
    throw new Error("Unauthorized");
  }
  return user;
}

export function requireRole(req: Request, roles: AppRole[]) {
  const user = requireAuthUser(req);
  const currentRole = (user.role ?? "TRADER") as AppRole;
  if (!roles.includes(currentRole)) {
    throw new Error("Forbidden");
  }
  return user;
}

