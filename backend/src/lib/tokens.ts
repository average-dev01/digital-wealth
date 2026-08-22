import { createHash, randomBytes } from "node:crypto";

/** Opaque, high-entropy token for one-time use (password reset links). */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString("hex");
}

/** Only the hash of a token is ever persisted — the raw value is never stored. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
