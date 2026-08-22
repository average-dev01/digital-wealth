/**
 * Provider registry. Selected once per process by `PRICE_PROVIDER`; add a new
 * implementation here and it becomes selectable with no other code change.
 */
import { coinpaprikaProvider } from "./coinpaprika";
import type { PriceProvider } from "./types";

const providers: Record<string, PriceProvider> = {
  [coinpaprikaProvider.name]: coinpaprikaProvider,
};

export function getPriceProvider(): PriceProvider {
  const name = (process.env.PRICE_PROVIDER ?? "coinpaprika").toLowerCase();
  const provider = providers[name];

  if (!provider) {
    throw new Error(
      `Unknown PRICE_PROVIDER "${name}". Available: ${Object.keys(providers).join(", ")}`,
    );
  }

  return provider;
}

export type { AssetProfile, AssetSearchHit, PriceProvider, PriceQuote } from "./types";
