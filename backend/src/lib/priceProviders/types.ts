/**
 * Provider-agnostic market data seam.
 *
 * Only Coinpaprika is implemented today. A second provider (CoinGecko is the
 * likely candidate) is a new file implementing this interface plus one line in
 * `./index.ts` — with one caveat: `externalId` values are provider-specific
 * ("btc-bitcoin" vs "bitcoin"), so they are NOT portable. Switching providers
 * means re-picking the id on every live currency.
 */

/** A single asset's current USD quote. */
export type PriceQuote = {
  externalId: string;
  priceUsd: number;
  /** Percent change over 24h. Null when the provider doesn't report one. */
  change24h: number | null;
  /** When the provider last refreshed this quote. */
  asOf: Date;
};

/** One hit from the admin's asset-picker search. */
export type AssetSearchHit = {
  externalId: string;
  symbol: string;
  name: string;
  rank: number;
};

/** Static metadata, fetched once when a currency is linked — not on the poll path. */
export type AssetProfile = {
  externalId: string;
  name: string;
  symbol: string;
  logoUrl: string | null;
};

export interface PriceProvider {
  readonly name: string;
  /**
   * Quotes for the given ids. Implementations should batch: cost must not grow
   * with catalogue size, or the free tier runs out. Ids the provider doesn't
   * know are omitted from the result rather than throwing.
   */
  fetchQuotes(externalIds: string[]): Promise<PriceQuote[]>;
  searchAssets(query: string): Promise<AssetSearchHit[]>;
  fetchProfile(externalId: string): Promise<AssetProfile>;
}
