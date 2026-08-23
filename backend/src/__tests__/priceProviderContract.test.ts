/**
 * The contract every price provider must satisfy, run against each registered
 * implementation. Adding a provider means adding one entry to `CASES`  the
 * behaviour `lib/priceFeed.ts` depends on is then covered without writing new
 * tests.
 *
 * `fetch` is stubbed throughout: this asserts our parsing and our failure
 * behaviour, not the vendor's uptime.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { coinpaprikaProvider } from "../lib/priceProviders/coinpaprika";
import type { PriceProvider } from "../lib/priceProviders/types";

type ProviderCase = {
  provider: PriceProvider;
  /** A batch-quote payload covering BTC and ETH, as the provider would send it. */
  quotesBody: unknown;
  /** A search payload with at least one usable hit. */
  searchBody: unknown;
  /** A profile payload carrying a logo URL. */
  profileBody: unknown;
  ids: { btc: string; eth: string };
  expected: { btcPrice: number; btcChange24h: number; logoUrl: string };
};

const CASES: ProviderCase[] = [
  {
    provider: coinpaprikaProvider,
    ids: { btc: "btc-bitcoin", eth: "eth-ethereum" },
    quotesBody: [
      {
        id: "btc-bitcoin",
        last_updated: "2026-08-19T03:35:14Z",
        quotes: { USD: { price: 64300.38, percent_change_24h: 0.22 } },
      },
      {
        id: "eth-ethereum",
        last_updated: "2026-08-19T03:35:14Z",
        quotes: { USD: { price: 1910.4, percent_change_24h: 0.8 } },
      },
      // An asset nobody asked for  must be filtered out, not returned.
      {
        id: "doge-dogecoin",
        last_updated: "2026-08-19T03:35:14Z",
        quotes: { USD: { price: 0.1, percent_change_24h: 5 } },
      },
    ],
    searchBody: {
      currencies: [
        { id: "btc-bitcoin", name: "Bitcoin", symbol: "BTC", rank: 1, is_active: true },
        { id: "dead-coin", name: "Dead Coin", symbol: "DEAD", rank: 0, is_active: false },
      ],
    },
    profileBody: {
      name: "Bitcoin",
      symbol: "BTC",
      logo: "https://static.coinpaprika.com/coin/btc-bitcoin/logo.png",
    },
    expected: {
      btcPrice: 64300.38,
      btcChange24h: 0.22,
      logoUrl: "https://static.coinpaprika.com/coin/btc-bitcoin/logo.png",
    },
  },
];

function stubFetch(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  } as Response);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe.each(CASES)("PriceProvider contract: $provider.name", (testCase) => {
  const { provider, ids, expected } = testCase;

  it("maps price, 24h change and timestamp for the requested ids only", async () => {
    stubFetch(testCase.quotesBody);

    const quotes = await provider.fetchQuotes([ids.btc, ids.eth]);

    expect(quotes).toHaveLength(2);
    const btc = quotes.find((q) => q.externalId === ids.btc);
    expect(btc?.priceUsd).toBeCloseTo(expected.btcPrice, 6);
    expect(btc?.change24h).toBeCloseTo(expected.btcChange24h, 6);
    expect(btc?.asOf).toBeInstanceOf(Date);
    expect(Number.isNaN(btc?.asOf.getTime())).toBe(false);
  });

  it("omits unknown ids instead of throwing", async () => {
    stubFetch(testCase.quotesBody);

    // The unknown id also triggers the per-id fallback path, which reuses the
    // same stub and finds nothing usable  it must still resolve.
    const quotes = await provider.fetchQuotes([ids.btc, "definitely-not-an-asset"]);

    expect(quotes.some((q) => q.externalId === ids.btc)).toBe(true);
    expect(quotes.some((q) => q.externalId === "definitely-not-an-asset")).toBe(false);
  });

  it("spends no request on an empty id list", async () => {
    const spy = stubFetch(testCase.quotesBody);

    await expect(provider.fetchQuotes([])).resolves.toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("throws a provider-labelled error on a non-2xx", async () => {
    stubFetch({}, { ok: false, status: 429 });

    await expect(provider.fetchQuotes([ids.btc])).rejects.toThrow(
      new RegExp(`${provider.name}.*429`, "i"),
    );
  });

  it("returns usable search hits and drops inactive assets", async () => {
    stubFetch(testCase.searchBody);

    const hits = await provider.searchAssets("bitcoin");

    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((hit) => hit.externalId && hit.symbol)).toBe(true);
    expect(hits.some((hit) => hit.symbol === "DEAD")).toBe(false);
  });

  it("resolves a logo URL from the profile", async () => {
    stubFetch(testCase.profileBody);

    const profile = await provider.fetchProfile(ids.btc);

    expect(profile.externalId).toBe(ids.btc);
    expect(profile.logoUrl).toBe(expected.logoUrl);
  });

  it("reports a null logo rather than an empty string", async () => {
    stubFetch({ name: "Nameless", symbol: "NIL" });

    const profile = await provider.fetchProfile(ids.btc);

    expect(profile.logoUrl).toBeNull();
  });
});
