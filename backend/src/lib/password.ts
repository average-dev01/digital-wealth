import bcrypt from "bcryptjs";

/**
 * 10 is the OWASP-recommended minimum work factor, and the right ceiling for
 * this build: `bcryptjs` is a pure-JS implementation (no native binding), so
 * it is far slower than native bcrypt at the same cost  measured on the dev
 * machine, cost 12 spends ~990ms per login versus ~160ms at cost 10, which
 * dominated every other source of request latency in the app.
 *
 * The cost is stored inside each hash, so existing hashes keep verifying at
 * whatever factor they were created with; only new hashes use this value.
 */
const SALT_ROUNDS = 10;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
