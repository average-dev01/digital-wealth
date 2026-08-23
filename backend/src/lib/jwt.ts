import jwt from "jsonwebtoken";

import { generateOpaqueToken } from "./tokens";

export type AccessTokenPayload = {
  sub: string;
  email: string;
};

export type RefreshTokenPayload = {
  sub: string;
};

const ACCESS_TOKEN_TTL = "15m";
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function getAccessSecret(): string {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error("Missing JWT_ACCESS_SECRET environment variable");
  return secret;
}

function getRefreshSecret(): string {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) throw new Error("Missing JWT_REFRESH_SECRET environment variable");
  return secret;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, getAccessSecret(), { expiresIn: ACCESS_TOKEN_TTL });
}

export function verifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    return jwt.verify(token, getAccessSecret()) as AccessTokenPayload;
  } catch {
    return null;
  }
}

/**
 * Refresh tokens are stateless-verifiable JWTs (self-contained expiry/subject)
 * AND tracked server-side via a SHA-256 hash in the `refresh_tokens` table —
 * the DB record is what actually allows revocation (logout, rotation) since
 * a JWT signature alone can't be invalidated before it expires.
 *
 * The `jti` claim exists purely so two tokens signed for the same user within
 * the same second (jwt.sign's `iat` has 1s granularity) never come out
 * byte-identical  without it they'd hash to the same tokenHash and collide
 * on the table's unique constraint.
 */
export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign({ ...payload, jti: generateOpaqueToken() }, getRefreshSecret(), {
    expiresIn: Math.floor(REFRESH_TOKEN_TTL_MS / 1000),
  });
}

export function verifyRefreshToken(token: string): RefreshTokenPayload | null {
  try {
    return jwt.verify(token, getRefreshSecret()) as RefreshTokenPayload;
  } catch {
    return null;
  }
}
