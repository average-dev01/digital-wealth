/**
 * Live market prices for the currency catalogue.
 *
 * Design notes worth keeping:
 * - Only `live` currencies with an `externalPriceId` are touched. `manual`
 *   rows are the escape hatch for demo assets and for a misbehaving feed.
 * - A failed refresh leaves every stored price alone. Degrading to a stale
 *   price is correct; degrading to zero would value real balances at nothing.
 * - `invalidateCurrencyCache()` is load-bearing. `getActiveCurrencies()` sits
 *   behind a 30s cache, so without it a fresh price stays invisible.
 */
import { invalidateCurrencyCache } from "./currencies";
import { prisma } from "./prisma";
import { getPriceProvider } from "./priceProviders";

export type PriceFeedRun = {
  at: Date;
  provider: string;
  /** Currencies whose price was written. */
  updated: number;
  /** `live` currencies with no external id  nothing to look up. */
  skipped: number;
  /** Ids the provider had no quote for. */
  missing: number;
  /** Logos filled in on this run. */
  logosFilled: number;
  durationMs: number;
  error: string | null;
};

/** Bounded so a catalogue of new currencies doesn't spike the call count. */
const MAX_LOGO_BACKFILL_PER_RUN = 3;

const DEFAULT_INTERVAL_MS = 300_000;

/**
 * Disabled under test for the same reason the rate limiter is: this is a
 * process-wide timer that would fire mid-suite and make outbound HTTP calls.
 */
const isTest = process.env.NODE_ENV === "test" || process.env.VITEST !== undefined;

let lastRun: PriceFeedRun | null = null;
let inFlight: Promise<PriceFeedRun> | null = null;
let timer: NodeJS.Timeout | null = null;

export function getLastRun(): PriceFeedRun | null {
  return lastRun;
}

export function getRefreshIntervalMs(): number {
  const parsed = Number(process.env.PRICE_REFRESH_INTERVAL_MS);
  return Number.isFinite(parsed) && parsed >= 30_000 ? parsed : DEFAULT_INTERVAL_MS;
}

/**
 * Fills `iconUrl` for a few live currencies that don't have one yet. Runs after
 * the price write so a provider outage here can never cost us the prices, and
 * is self-healing: currencies linked before this shipped, or whose link-time
 * lookup failed, get picked up on a later tick.
 */
async function backfillLogos(
  provider: ReturnType<typeof getPriceProvider>,
  rows: Array<{ id: string; externalPriceId: string | null; iconUrl: string | null }>,
): Promise<number> {
  const pending = rows
    .filter((row) => row.iconUrl === null && row.externalPriceId !== null)
    .slice(0, MAX_LOGO_BACKFILL_PER_RUN);

  let filled = 0;
  for (const row of pending) {
    try {
      const profile = await provider.fetchProfile(row.externalPriceId as string);
      if (!profile.logoUrl) continue;
      await prisma.currency.update({ where: { id: row.id }, data: { iconUrl: profile.logoUrl } });
      filled += 1;
    } catch {
      // Cosmetic  a missing logo falls back to the admin's text glyph.
    }
  }

  return filled;
}

async function runRefresh(): Promise<PriceFeedRun> {
  const startedAt = Date.now();
  const provider = getPriceProvider();
  const base = { at: new Date(), provider: provider.name };

  const rows = await prisma.currency.findMany({
    where: { priceSource: "live" },
    select: { id: true, symbol: true, externalPriceId: true, iconUrl: true },
  });

  const linked = rows.filter((row) => row.externalPriceId !== null);
  const skipped = rows.length - linked.length;

  // Nothing to price: a fresh database has no currencies at all, and burning a
  // call on an empty id list would just waste the monthly budget.
  if (linked.length === 0) {
    return {
      ...base,
      updated: 0,
      skipped,
      missing: 0,
      logosFilled: 0,
      durationMs: Date.now() - startedAt,
      error: null,
    };
  }

  let quotes;
  try {
    quotes = await provider.fetchQuotes(linked.map((row) => row.externalPriceId as string));
  } catch (err) {
    const error = err instanceof Error ? err.message : "Price feed request failed";
    return {
      ...base,
      updated: 0,
      skipped,
      missing: linked.length,
      logosFilled: 0,
      durationMs: Date.now() - startedAt,
      error,
    };
  }

  const byId = new Map(quotes.map((quote) => [quote.externalId, quote]));
  const updates = [];

  for (const row of linked) {
    const quote = byId.get(row.externalPriceId as string);
    if (!quote) continue;

    updates.push(
      prisma.currency.update({
        where: { id: row.id },
        data: {
          mockPriceUsd: quote.priceUsd,
          priceChange24h: quote.change24h,
          priceUpdatedAt: quote.asOf,
        },
      }),
    );
  }

  if (updates.length > 0) {
    await prisma.$transaction(updates);
    // Conversions and wallet listings read through a 30s cache; without this
    // the new prices stay invisible for up to that long.
    invalidateCurrencyCache();
  }

  const logosFilled = await backfillLogos(provider, linked);
  if (logosFilled > 0) invalidateCurrencyCache();

  return {
    ...base,
    updated: updates.length,
    skipped,
    missing: linked.length - updates.length,
    logosFilled,
    durationMs: Date.now() - startedAt,
    error: null,
  };
}

/**
 * Refreshes every live price. Concurrent callers (the timer firing while an
 * admin hits "Refresh prices") share one in-flight run rather than doubling up
 * on outbound calls.
 */
export async function refreshPrices(): Promise<PriceFeedRun> {
  if (inFlight) return inFlight;

  inFlight = runRefresh()
    .catch((err): PriceFeedRun => ({
      at: new Date(),
      provider: process.env.PRICE_PROVIDER ?? "coinpaprika",
      updated: 0,
      skipped: 0,
      missing: 0,
      logosFilled: 0,
      durationMs: 0,
      error: err instanceof Error ? err.message : "Price feed failed",
    }))
    .then((run) => {
      lastRun = run;
      return run;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

function logRun(run: PriceFeedRun): void {
  if (run.error) {
    console.error(`[price-feed] ${run.provider} failed after ${run.durationMs}ms  ${run.error}`);
    return;
  }

  console.log(
    `[price-feed] updated ${run.updated}, skipped ${run.skipped}, missing ${run.missing}` +
      `${run.logosFilled > 0 ? `, logos ${run.logosFilled}` : ""} in ${run.durationMs}ms`,
  );
}

/**
 * Starts the polling loop. Called from `index.ts`, deliberately NOT from
 * `app.ts`  tests build the app directly, and a timer there would fire (and
 * make real HTTP calls) on every vitest run.
 */
export function startPriceFeed(): void {
  if (isTest || process.env.PRICE_FEED_ENABLED === "false") {
    console.log("[price-feed] disabled");
    return;
  }

  const intervalMs = getRefreshIntervalMs();
  void refreshPrices().then(logRun);

  timer = setInterval(() => {
    void refreshPrices().then(logRun);
  }, intervalMs);

  // Don't hold the event loop open on shutdown.
  timer.unref();
  console.log(`[price-feed] polling every ${Math.round(intervalMs / 1000)}s`);
}

export function stopPriceFeed(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
