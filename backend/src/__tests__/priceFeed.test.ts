/**
 * The price feed's behaviour against a real database, with `fetch` stubbed.
 *
 * The cases that matter most are the failure ones: a dead provider must leave
 * stored prices exactly as they were, because degrading to a stale price is
 * correct and degrading to zero would value real customer balances at nothing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getCurrency, invalidateCurrencyCache } from "../lib/currencies";
import { refreshPrices } from "../lib/priceFeed";
import { prisma } from "../lib/prisma";

const BTC_ID = "btc-bitcoin";
const ETH_ID = "eth-ethereum";

/** Coinpaprika's `/tickers` shape, trimmed to the fields we read. */
function ticker(id: string, price: number, change: number) {
  return {
    id,
    last_updated: "2026-08-19T03:35:14Z",
    quotes: { USD: { price, percent_change_24h: change } },
  };
}

function stubJson(body: unknown) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
  } as Response);
}

/** Links a fixture currency to the feed. Fixtures default to `manual`. */
async function makeLive(symbol: string, externalPriceId: string, iconUrl: string | null = null) {
  await prisma.currency.update({
    where: { symbol },
    data: { priceSource: "live", externalPriceId, iconUrl },
  });
  invalidateCurrencyCache();
}

async function priceOf(symbol: string): Promise<number> {
  const row = await prisma.currency.findUniqueOrThrow({ where: { symbol } });
  return Number(row.mockPriceUsd);
}

beforeEach(() => {
  delete process.env.PRICE_PROVIDER;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("refreshPrices", () => {
  it("writes price, 24h change and timestamp for live currencies", async () => {
    await makeLive("BTC", BTC_ID, "https://example.test/btc.png");
    stubJson([ticker(BTC_ID, 64300.38, 0.22)]);

    const run = await refreshPrices();

    expect(run.error).toBeNull();
    expect(run.updated).toBe(1);

    const btc = await prisma.currency.findUniqueOrThrow({ where: { symbol: "BTC" } });
    expect(Number(btc.mockPriceUsd)).toBeCloseTo(64300.38, 6);
    expect(Number(btc.priceChange24h)).toBeCloseTo(0.22, 4);
    expect(btc.priceUpdatedAt).toBeInstanceOf(Date);
  });

  it("leaves manual currencies untouched", async () => {
    await makeLive("BTC", BTC_ID, "https://example.test/btc.png");
    const usdtBefore = await priceOf("USDT"); // fixture stays `manual`
    stubJson([ticker(BTC_ID, 64300.38, 0.22), ticker("usdt-tether", 999, 50)]);

    await refreshPrices();

    expect(await priceOf("USDT")).toBeCloseTo(usdtBefore, 6);
  });

  it("skips live currencies that have no external id", async () => {
    await prisma.currency.update({
      where: { symbol: "ETH" },
      data: { priceSource: "live", externalPriceId: null },
    });
    await makeLive("BTC", BTC_ID, "https://example.test/btc.png");
    stubJson([ticker(BTC_ID, 64300.38, 0.22)]);

    const run = await refreshPrices();

    expect(run.skipped).toBe(1);
    expect(run.updated).toBe(1);
  });

  it("spends no request when nothing is linked", async () => {
    const spy = stubJson([]);

    const run = await refreshPrices();

    expect(spy).not.toHaveBeenCalled();
    expect(run.updated).toBe(0);
    expect(run.error).toBeNull();
  });

  it("leaves stored prices alone when the provider fails", async () => {
    await makeLive("BTC", BTC_ID, "https://example.test/btc.png");
    const before = await priceOf("BTC");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    const run = await refreshPrices();

    expect(run.error).toMatch(/network down/i);
    expect(run.updated).toBe(0);
    expect(await priceOf("BTC")).toBeCloseTo(before, 6);
  });

  it("leaves stored prices alone on a non-2xx response", async () => {
    await makeLive("BTC", BTC_ID, "https://example.test/btc.png");
    const before = await priceOf("BTC");
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({}),
    } as Response);

    const run = await refreshPrices();

    expect(run.error).toMatch(/429/);
    expect(await priceOf("BTC")).toBeCloseTo(before, 6);
  });

  it("counts a linked currency the provider has no quote for as missing", async () => {
    await makeLive("BTC", BTC_ID, "https://example.test/btc.png");
    await makeLive("ETH", "not-a-real-asset", "https://example.test/eth.png");
    stubJson([ticker(BTC_ID, 64300.38, 0.22)]);

    const run = await refreshPrices();

    expect(run.updated).toBe(1);
    expect(run.missing).toBe(1);
  });

  it("invalidates the catalogue cache so the new price is visible at once", async () => {
    await makeLive("BTC", BTC_ID, "https://example.test/btc.png");
    // Warm the 30s cache with the old value first.
    expect((await getCurrency("BTC"))?.mockPriceUsd).toBeCloseTo(96420.35, 2);
    stubJson([ticker(BTC_ID, 64300.38, 0.22)]);

    await refreshPrices();

    expect((await getCurrency("BTC"))?.mockPriceUsd).toBeCloseTo(64300.38, 2);
  });

  it("backfills a missing logo and caps how many it fetches per run", async () => {
    // All three fixtures live, none with a logo — the cap is 3, so raising it
    // above the cap is what proves the cap exists.
    await makeLive("BTC", BTC_ID, null);
    await makeLive("ETH", ETH_ID, null);
    await makeLive("USDT", "usdt-tether", null);

    let profileCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/coins/")) {
        profileCalls += 1;
        return {
          ok: true,
          status: 200,
          json: async () => ({ logo: "https://cdn.test/l.png" }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => [
          ticker(BTC_ID, 64300.38, 0.22),
          ticker(ETH_ID, 1910.4, 0.8),
          ticker("usdt-tether", 1, 0.01),
        ],
      } as Response;
    });

    const run = await refreshPrices();

    expect(run.logosFilled).toBeLessThanOrEqual(3);
    expect(run.logosFilled).toBeGreaterThan(0);
    expect(profileCalls).toBeLessThanOrEqual(3);

    const btc = await prisma.currency.findUniqueOrThrow({ where: { symbol: "BTC" } });
    expect(btc.iconUrl).toBe("https://cdn.test/l.png");
  });

  it("does not re-fetch a logo that is already stored", async () => {
    await makeLive("BTC", BTC_ID, "https://example.test/existing.png");

    let profileCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input).includes("/coins/")) profileCalls += 1;
      return {
        ok: true,
        status: 200,
        json: async () => [ticker(BTC_ID, 64300.38, 0.22)],
      } as Response;
    });

    await refreshPrices();

    expect(profileCalls).toBe(0);
    const btc = await prisma.currency.findUniqueOrThrow({ where: { symbol: "BTC" } });
    expect(btc.iconUrl).toBe("https://example.test/existing.png");
  });

  it("reports an unknown provider instead of crashing the caller", async () => {
    process.env.PRICE_PROVIDER = "not-a-provider";
    await makeLive("BTC", BTC_ID, null);

    const run = await refreshPrices();

    expect(run.error).toMatch(/unknown price_provider/i);
    expect(await priceOf("BTC")).toBeCloseTo(96420.35, 2);
  });
});
