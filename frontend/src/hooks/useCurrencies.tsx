"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { listCurrencies, type Currency } from "@/lib/api/currencies";
import { formatCryptoAmount } from "@/lib/market";

/**
 * Live currency catalogue for the signed-in app.
 *
 * Everything a wallet card needs  name, glyph, decimals, price, whether the
 * asset is still accepting deposits  comes from the database, so an asset an
 * administrator creates renders correctly straight away. The helpers returned
 * here replace the old compile-time lookups in `lib/market.ts`, which
 * silently fell back to the first hardcoded entry (Bitcoin) for any symbol it
 * didn't know, valuing a brand-new asset at Bitcoin's price.
 */
export function useCurrencies() {
  const query = useQuery({
    queryKey: ["currencies"],
    queryFn: listCurrencies,
    // The catalogue only changes when an admin edits it, and those screens
    // invalidate this key explicitly after a write.
    staleTime: 60_000,
    // Prices do move on their own now. A minute is well inside the feed's
    // refresh interval, so an open dashboard follows the market without
    // hammering the backend.
    refetchInterval: 60_000,
  });

  const currencies = useMemo(() => query.data ?? [], [query.data]);

  const helpers = useMemo(() => {
    const bySymbol = new Map(currencies.map((c) => [c.symbol, c]));

    return {
      /** Undefined for an asset that isn't in the catalogue  callers show a fallback. */
      getCurrency: (code: string): Currency | undefined => bySymbol.get(code),
      /** 0 for an unknown asset, rather than silently valuing it as something else. */
      usdValue: (code: string, amount: number): number =>
        amount * (bySymbol.get(code)?.mock_price_usd ?? 0),
      formatCrypto: (code: string, amount: number): string =>
        formatCryptoAmount(amount, bySymbol.get(code)?.decimals ?? 8),
      isActive: (code: string): boolean => bySymbol.get(code)?.is_active ?? false,
      /**
       * Null rather than 0 when we have no figure: "0%" is a claim that the
       * market didn't move, which is not the same as having no data.
       */
      change24h: (code: string): number | null => bySymbol.get(code)?.price_change_24h ?? null,
    };
  }, [currencies]);

  /**
   * The freshest price stamp in the catalogue, for a "prices as of …" line.
   * Null when nothing is live-priced, so the UI can omit the line rather than
   * implying a staleness it can't vouch for.
   */
  const pricesUpdatedAt = useMemo(() => {
    const stamps = currencies
      .map((c) => c.price_updated_at)
      .filter((value): value is string => value !== null)
      .map((value) => new Date(value).getTime())
      .filter((time) => !Number.isNaN(time));

    return stamps.length > 0 ? new Date(Math.max(...stamps)) : null;
  }, [currencies]);

  return {
    currencies,
    activeCurrencies: useMemo(() => currencies.filter((c) => c.is_active), [currencies]),
    isLoading: query.isLoading,
    pricesUpdatedAt,
    ...helpers,
  };
}
