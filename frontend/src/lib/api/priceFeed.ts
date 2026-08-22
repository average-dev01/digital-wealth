// Admin controls for the market data feed: the asset picker used when linking
// a currency, an on-demand refresh, and the last run's outcome.

import { fetchApi } from "./client";

export type AssetSearchHit = {
  external_id: string;
  symbol: string;
  name: string;
  rank: number;
};

export type PriceFeedRun = {
  at: string;
  provider: string;
  updated: number;
  skipped: number;
  missing: number;
  logos_filled: number;
  duration_ms: number;
  error: string | null;
};

export type PriceFeedStatus = {
  provider: string;
  interval_ms: number;
  enabled: boolean;
  last_run: PriceFeedRun | null;
};

type BackendHit = { externalId: string; symbol: string; name: string; rank: number };

type BackendRun = {
  at: string;
  provider: string;
  updated: number;
  skipped: number;
  missing: number;
  logosFilled: number;
  durationMs: number;
  error: string | null;
};

function toRun(run: BackendRun): PriceFeedRun {
  return {
    at: run.at,
    provider: run.provider,
    updated: run.updated,
    skipped: run.skipped,
    missing: run.missing,
    logos_filled: run.logosFilled,
    duration_ms: run.durationMs,
    error: run.error,
  };
}

/** Asset picker for linking a currency. Needs at least two characters. */
export async function searchAssets(query: string): Promise<AssetSearchHit[]> {
  const data = await fetchApi<{ results: BackendHit[] }>(
    `/admin/price-feed/search?q=${encodeURIComponent(query)}`,
  );
  return data.results.map((hit) => ({
    external_id: hit.externalId,
    symbol: hit.symbol,
    name: hit.name,
    rank: hit.rank,
  }));
}

export async function refreshPrices(): Promise<PriceFeedRun> {
  const data = await fetchApi<{ run: BackendRun }>("/admin/price-feed/refresh", { method: "POST" });
  return toRun(data.run);
}

export async function getPriceFeedStatus(): Promise<PriceFeedStatus> {
  const data = await fetchApi<{
    provider: string;
    intervalMs: number;
    enabled: boolean;
    lastRun: BackendRun | null;
  }>("/admin/price-feed/status");

  return {
    provider: data.provider,
    interval_ms: data.intervalMs,
    enabled: data.enabled,
    last_run: data.lastRun ? toRun(data.lastRun) : null,
  };
}
