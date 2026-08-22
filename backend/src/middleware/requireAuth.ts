import type { NextFunction, Request, Response } from "express";

import { verifyAccessToken } from "../lib/jwt";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.signedCookies?.access_token as string | undefined;
  const payload = token ? verifyAccessToken(token) : null;

  if (!payload) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  req.userId = payload.sub;
  req.userEmail = payload.email;
  next();
}
