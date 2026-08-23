/**
 * Live USD prices for the "Supported assets" strip on the public homepage.
 *
 * Two sources, merged per-asset rather than all-or-nothing:
 *
 *  1. Our own backend's public `GET /currencies` — it already runs the same
 *     Coinpaprika-backed price feed for real customer balances
 *     (`backend/src/lib/priceFeed.ts`) and caches the result for 30s
 *     (`backend/src/lib/currencies.ts`), so reading it here costs nothing
 *     extra against Coinpaprika's quota. This is the normal path, but it
 *     only knows about currencies an admin has actually created — it can
 *     respond successfully while still having no entry for one of the 7
 *     marketing assets.
 *  2. Coinpaprika directly (same provider, no API key) fills in whatever
 *     the backend didn't cover — either because it's unreachable, or
 *     because a specific asset just isn't in the catalogue yet. This path
 *     is cached far longer (20 min vs. the backend path's 1 min): it only
 *     runs when there's a gap to fill, and an extended gap (backend down,
 *     or an asset that's simply never been listed) should not turn into
 *     the frontend hammering Coinpaprika on every request either.
 *  3. Whatever neither source covers, the caller (`app/[locale]/page.tsx`)
 *     falls back to `MARKETING_ASSETS`' static display values.
 *
 * Talking to Coinpaprika directly only as a fallback keeps the marketing
 * page's normal-case behaviour aligned with `lib/market.ts`'s "no dependency
 * on a running backend" note in spirit — the backend being down or missing
 * an asset degrades pricing freshness, it doesn't take the page down.
 */
import type { MarketingAsset } from "./market";

const BACKEND_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
const COINPAPRIKA_TICKERS_URL = "https://api.coinpaprika.com/v1/tickers?quotes=USD";

const BACKEND_CACHE_TTL_MS = 60 * 1000;
// Matches the backend's default PRICE_REFRESH_INTERVAL_MS (5 min) — see
// backend/.env.example — but wider still, since this path only runs to fill
// a gap and should stay light on Coinpaprika's quota while that gap persists.
const COINPAPRIKA_CACHE_TTL_MS = 20 * 60 * 1000;
const BACKEND_TIMEOUT_MS = 3_000;

type BackendCurrency = {
  symbol?: unknown;
  mockPriceUsd?: unknown;
  priceChange24h?: unknown;
};

type PaprikaTicker = {
  id?: unknown;
  quotes?: { USD?: { price?: unknown; percent_change_24h?: unknown } };
};

export type LiveMarketPrice = { priceUsd: number; change24h: number };

let backendCache: { expiresAt: number; prices: Map<string, LiveMarketPrice> } | null = null;
let backendInFlight: Promise<Map<string, LiveMarketPrice> | null> | null = null;

let paprikaCache: { expiresAt: number; prices: Map<string, LiveMarketPrice> } | null = null;
let paprikaInFlight: Promise<Map<string, LiveMarketPrice>> | null = null;

/** Null means "unreachable / bad response" — distinct from an empty match set. */
async function fetchFromBackend(
  assets: readonly MarketingAsset[],
): Promise<Map<string, LiveMarketPrice> | null> {
  const wanted = new Set(assets.map((a) => a.code));

  try {
    const res = await fetch(`${BACKEND_URL}/currencies`, {
      cache: "no-store",
      signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
    });
    if (!res.ok) return null;

    const body: unknown = await res.json();
    const rows = (body as { currencies?: unknown })?.currencies;
    if (!Array.isArray(rows)) return null;

    const prices = new Map<string, LiveMarketPrice>();
    for (const row of rows as BackendCurrency[]) {
      if (typeof row.symbol !== "string" || !wanted.has(row.symbol)) continue;

      const price = Number(row.mockPriceUsd);
      if (!Number.isFinite(price) || price <= 0) continue;

      const change = Number(row.priceChange24h);
      prices.set(row.symbol, { priceUsd: price, change24h: Number.isFinite(change) ? change : 0 });
    }
    return prices;
  } catch {
    return null;
  }
}

async function fetchFromCoinpaprika(
  assets: readonly MarketingAsset[],
): Promise<Map<string, LiveMarketPrice>> {
  const byExternalId = new Map(assets.map((a) => [a.externalPriceId, a.code]));
  const prices = new Map<string, LiveMarketPrice>();

  try {
    const res = await fetch(COINPAPRIKA_TICKERS_URL, { cache: "no-store" });
    if (!res.ok) return prices;

    const tickers: unknown = await res.json();
    if (!Array.isArray(tickers)) return prices;

    for (const ticker of tickers as PaprikaTicker[]) {
      const code = typeof ticker.id === "string" ? byExternalId.get(ticker.id) : undefined;
      if (!code) continue;

      const price = Number(ticker.quotes?.USD?.price);
      if (!Number.isFinite(price) || price <= 0) continue;

      const change = Number(ticker.quotes?.USD?.percent_change_24h);
      prices.set(code, { priceUsd: price, change24h: Number.isFinite(change) ? change : 0 });
    }
  } catch {
    // Falls through to the empty map — caller falls back to static values.
  }

  return prices;
}

async function getBackendPrices(
  assets: readonly MarketingAsset[],
): Promise<Map<string, LiveMarketPrice> | null> {
  if (backendCache && backendCache.expiresAt > Date.now()) return backendCache.prices;

  backendInFlight ??= fetchFromBackend(assets).finally(() => {
    backendInFlight = null;
  });
  const fromBackend = await backendInFlight;

  if (fromBackend) {
    backendCache = { expiresAt: Date.now() + BACKEND_CACHE_TTL_MS, prices: fromBackend };
  }
  return fromBackend;
}

async function getPaprikaPrices(
  assets: readonly MarketingAsset[],
): Promise<Map<string, LiveMarketPrice>> {
  if (paprikaCache && paprikaCache.expiresAt > Date.now()) return paprikaCache.prices;

  paprikaInFlight ??= fetchFromCoinpaprika(assets).finally(() => {
    paprikaInFlight = null;
  });
  const fromPaprika = await paprikaInFlight;

  if (fromPaprika.size > 0) {
    paprikaCache = { expiresAt: Date.now() + COINPAPRIKA_CACHE_TTL_MS, prices: fromPaprika };
  }
  return fromPaprika;
}

/**
 * Never throws. Keys are MarketingAsset `code`s (e.g. "BTC").
 *
 * Per-asset merge, not all-or-nothing: the backend can respond successfully
 * while still having no entry for one of the 7 marketing assets (e.g. an
 * asset that hasn't been created in the admin catalogue yet). Coinpaprika is
 * consulted to fill exactly those gaps — not only when the backend is
 * completely unreachable — otherwise a missing catalogue entry would
 * silently and permanently fall back to the static `displayPriceUsd` in
 * `market.ts` with no way to recover.
 */
export async function fetchLiveMarketingPrices(
  assets: readonly MarketingAsset[],
): Promise<Map<string, LiveMarketPrice>> {
  const fromBackend = await getBackendPrices(assets);
  const merged = new Map(fromBackend ?? []);

  const missing = assets.filter((a) => !merged.has(a.code));
  if (missing.length === 0) return merged;

  const fromPaprika = await getPaprikaPrices(assets);
  for (const asset of missing) {
    const quote = fromPaprika.get(asset.code);
    if (quote) merged.set(asset.code, quote);
  }

  return merged;
}
