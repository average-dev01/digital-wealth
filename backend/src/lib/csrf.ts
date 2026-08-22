import type { NextFunction, Request, Response } from "express";

import { ensureCsrfCookie } from "./cookies";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Synchronizer-style double-submit CSRF check: the browser can't be forced to
 * send a custom header cross-site, so requiring `X-CSRF-Token` to match the
 * `csrf_token` cookie proves the request came from same-origin JS. Also
 * responsible for issuing the csrf_token cookie on first contact.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  const cookieToken = ensureCsrfCookie(res, req.cookies?.csrf_token as string | undefined);

  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const headerToken = req.header("x-csrf-token");
  if (!headerToken || headerToken !== cookieToken) {
    res.status(403).json({ error: "Invalid or missing CSRF token" });
    return;
  }

  next();
}
