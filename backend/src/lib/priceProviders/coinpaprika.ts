/**
 * Coinpaprika  the free tier: 20,000 calls/month, no API key, no signup,
 * 10 req/sec, covering roughly the top 2,000 assets.
 *
 * The call budget is why `fetchQuotes` pulls the whole ticker list in ONE
 * request and filters locally: cost is 1 call per refresh no matter how many
 * currencies the desk lists. Per-coin lookups would exceed the monthly budget
 * past about four assets at a five-minute interval.
 */
import { getJson, toDate, toNumber } from "./http";
import type { AssetProfile, AssetSearchHit, PriceProvider, PriceQuote } from "./types";

const NAME = "coinpaprika";
const BASE_URL = process.env.COINPAPRIKA_BASE_URL ?? "https://api.coinpaprika.com/v1";

/**
 * The free tier only covers the top ~2,000 assets, so an id can legitimately be
 * absent from the batch. We retry those individually, but cap it: an admin who
 * links a dozen obscure assets shouldn't turn one refresh into a dozen calls.
 */
const MAX_FALLBACK_LOOKUPS = 5;

type PaprikaTicker = {
  id?: unknown;
  last_updated?: unknown;
  quotes?: { USD?: { price?: unknown; percent_change_24h?: unknown } };
};

type PaprikaSearchResult = {
  currencies?: Array<{
    id?: unknown;
    name?: unknown;
    symbol?: unknown;
    rank?: unknown;
    is_active?: unknown;
  }>;
};

type PaprikaCoin = { name?: unknown; symbol?: unknown; logo?: unknown };

/**
 * A ticker is only usable with a positive price  a zero or missing price would
 * silently value a customer's holdings at nothing, which is worse than keeping
 * the previous figure.
 */
function toQuote(ticker: PaprikaTicker): PriceQuote | null {
  const externalId = typeof ticker.id === "string" ? ticker.id : null;
  const price = toNumber(ticker.quotes?.USD?.price);
  if (!externalId || price === null || price <= 0) return null;

  return {
    externalId,
    priceUsd: price,
    change24h: toNumber(ticker.quotes?.USD?.percent_change_24h),
    asOf: toDate(ticker.last_updated),
  };
}

export const coinpaprikaProvider: PriceProvider = {
  name: NAME,

  async fetchQuotes(externalIds: string[]): Promise<PriceQuote[]> {
    if (externalIds.length === 0) return [];

    const wanted = new Set(externalIds);
    const tickers = await getJson<PaprikaTicker[]>(NAME, `${BASE_URL}/tickers?quotes=USD`);
    if (!Array.isArray(tickers)) {
      throw new Error(`${NAME} /tickers returned an unexpected payload`);
    }

    const quotes: PriceQuote[] = [];
    for (const ticker of tickers) {
      if (typeof ticker?.id !== "string" || !wanted.has(ticker.id)) continue;
      const quote = toQuote(ticker);
      if (quote) quotes.push(quote);
    }

    const missing = externalIds.filter((id) => !quotes.some((q) => q.externalId === id));
    for (const id of missing.slice(0, MAX_FALLBACK_LOOKUPS)) {
      try {
        const ticker = await getJson<PaprikaTicker>(
          NAME,
          `${BASE_URL}/tickers/${encodeURIComponent(id)}?quotes=USD`,
        );
        const quote = toQuote(ticker);
        if (quote) quotes.push(quote);
      } catch {
        // A single unknown id must not sink the whole refresh: the currencies
        // that did resolve should still get their new prices.
      }
    }

    return quotes;
  },

  async searchAssets(query: string): Promise<AssetSearchHit[]> {
    const result = await getJson<PaprikaSearchResult>(
      NAME,
      `${BASE_URL}/search?q=${encodeURIComponent(query)}&c=currencies&limit=10`,
    );

    return (result.currencies ?? [])
      .filter((row) => row.is_active !== false)
      .flatMap((row) => {
        if (typeof row.id !== "string" || typeof row.symbol !== "string") return [];
        return [
          {
            externalId: row.id,
            symbol: row.symbol,
            name: typeof row.name === "string" ? row.name : row.symbol,
            rank: toNumber(row.rank) ?? 0,
          },
        ];
      });
  },

  async fetchProfile(externalId: string): Promise<AssetProfile> {
    const coin = await getJson<PaprikaCoin>(
      NAME,
      `${BASE_URL}/coins/${encodeURIComponent(externalId)}`,
    );

    return {
      externalId,
      name: typeof coin.name === "string" ? coin.name : externalId,
      symbol: typeof coin.symbol === "string" ? coin.symbol : "",
      logoUrl: typeof coin.logo === "string" && coin.logo.length > 0 ? coin.logo : null,
    };
  },
};
