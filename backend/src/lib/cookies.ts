import type { CookieOptions, Response } from "express";
import { randomBytes } from "node:crypto";

import { REFRESH_TOKEN_TTL_MS } from "./jwt";

const isProd = process.env.NODE_ENV === "production";

const baseCookie: CookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: "strict",
  signed: true,
  path: "/",
};

export function setAccessCookie(res: Response, token: string): void {
  res.cookie("access_token", token, { ...baseCookie, maxAge: 15 * 60 * 1000 });
}

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie("refresh_token", token, { ...baseCookie, maxAge: REFRESH_TOKEN_TTL_MS });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie("access_token", baseCookie);
  res.clearCookie("refresh_token", baseCookie);
}

/** Double-submit CSRF cookie: readable by client JS, echoed back as a header. */
export function ensureCsrfCookie(res: Response, existing: string | undefined): string {
  if (existing) return existing;
  const token = randomBytes(24).toString("hex");
  res.cookie("csrf_token", token, {
    httpOnly: false,
    secure: isProd,
    sameSite: "strict",
    path: "/",
    maxAge: REFRESH_TOKEN_TTL_MS,
  });
  return token;
}
