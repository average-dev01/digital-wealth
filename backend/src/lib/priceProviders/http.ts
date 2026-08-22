/**
 * Shared HTTP plumbing for price providers, so a new provider only has to
 * describe *its* endpoints — not re-solve timeouts, status handling and the
 * "provider sent us a string where a number belongs" problem.
 */

const DEFAULT_TIMEOUT_MS = 15_000;

export type GetJsonOptions = {
  /** Extra headers, e.g. a provider's API key. */
  headers?: Record<string, string>;
  timeoutMs?: number;
};

/**
 * GETs JSON, throwing a provider-labelled error on any non-2xx. The label
 * matters: these messages surface in the admin UI and in `[price-feed]` logs,
 * so they need to say which provider failed.
 */
export async function getJson<T>(
  provider: string,
  url: string,
  options: GetJsonOptions = {},
): Promise<T> {
  const res = await fetch(url, {
    headers: { accept: "application/json", ...options.headers },
    signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`${provider} responded ${res.status} for ${new URL(url).pathname}`);
  }

  return (await res.json()) as T;
}

/**
 * Coerces a provider field to a finite number, or null. Providers are
 * inconsistent about returning numbers vs numeric strings, and a NaN sneaking
 * into a price column would value real balances at nothing.
 */
export function toNumber(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/** Parses a provider timestamp, falling back to now when it is absent or junk. */
export function toDate(value: unknown): Date {
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(typeof value === "number" ? value * 1000 : value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}
