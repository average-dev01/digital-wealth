// The currency catalogue  the source of truth for which assets exist.
// Creating/deactivating a currency drives customer wallet provisioning on the
// backend, and `listCurrencies()` below is how the customer app resolves the
// display metadata (name, glyph, decimals, price) for a wallet, so a
// brand-new asset renders correctly with no client-side change.

import { fetchApi } from "./client";

export type Currency = {
  id: string;
  symbol: string;
  name: string;
  decimals: number;
  /** Short text/emoji glyph shown next to the symbol. Fallback for icon_url. */
  icon: string | null;
  /** Provider-hosted logo, populated when the currency is linked to the feed. */
  icon_url: string | null;
  mock_price_usd: number;
  /** "live" prices come from the market data feed; "manual" ones are admin-typed. */
  price_source: PriceSource;
  external_price_id: string | null;
  /** Percent change over 24h. Null for manual assets and ones never refreshed. */
  price_change_24h: number | null;
  price_updated_at: string | null;
  is_active: boolean;
  created_at: string;
};

export type PriceSource = "manual" | "live";

export type CurrencyInput = {
  symbol: string;
  name: string;
  decimals: number;
  icon: string | null;
  /** Optional for a live currency  the backend seeds it from the provider. */
  mock_price_usd?: number;
  price_source: PriceSource;
  external_price_id: string | null;
  is_active: boolean;
};

type BackendCurrency = {
  id: string;
  symbol: string;
  name: string;
  decimals: number;
  icon: string | null;
  iconUrl: string | null;
  mockPriceUsd: string;
  priceSource: PriceSource;
  externalPriceId: string | null;
  priceChange24h: string | null;
  priceUpdatedAt: string | null;
  isActive: boolean;
  createdAt: string;
};

function toCurrency(row: BackendCurrency): Currency {
  return {
    id: row.id,
    symbol: row.symbol,
    name: row.name,
    decimals: row.decimals,
    icon: row.icon,
    icon_url: row.iconUrl ?? null,
    // Prisma Decimal serializes as a string.
    mock_price_usd: Number(row.mockPriceUsd),
    price_source: row.priceSource ?? "manual",
    external_price_id: row.externalPriceId ?? null,
    // Null-preserving on purpose: Number(null) is 0, and "0%" is a claim about
    // the market, whereas null means "we have no 24h figure for this asset".
    price_change_24h:
      row.priceChange24h === null || row.priceChange24h === undefined
        ? null
        : Number(row.priceChange24h),
    price_updated_at: row.priceUpdatedAt ?? null,
    is_active: row.isActive,
    created_at: row.createdAt,
  };
}

function toPayload(data: Partial<CurrencyInput>) {
  return {
    ...(data.symbol !== undefined ? { symbol: data.symbol.trim().toUpperCase() } : {}),
    ...(data.name !== undefined ? { name: data.name } : {}),
    ...(data.decimals !== undefined ? { decimals: data.decimals } : {}),
    ...(data.icon !== undefined ? { icon: data.icon } : {}),
    ...(data.mock_price_usd !== undefined ? { mockPriceUsd: data.mock_price_usd } : {}),
    ...(data.price_source !== undefined ? { priceSource: data.price_source } : {}),
    ...(data.external_price_id !== undefined ? { externalPriceId: data.external_price_id } : {}),
    ...(data.is_active !== undefined ? { isActive: data.is_active } : {}),
  };
}

/** Every currency, including deactivated ones (the admin table shows both). */
export async function getAllCurrencies(): Promise<Currency[]> {
  const data = await fetchApi<{ currencies: BackendCurrency[] }>("/admin/currencies");
  return data.currencies.map(toCurrency);
}

/**
 * Public catalogue read  no admin rights needed, so customer screens can
 * resolve an asset's real name/glyph/decimals/price. Deactivated currencies
 * are included so a customer still holding one sees a correct card (with
 * deposits disabled) rather than the wallet disappearing.
 */
export async function listCurrencies(): Promise<Currency[]> {
  const data = await fetchApi<{ currencies: BackendCurrency[] }>("/currencies");
  return data.currencies.map(toCurrency);
}

export async function getCurrencyById(currencyId: string): Promise<Currency | null> {
  try {
    const data = await fetchApi<{ currency: BackendCurrency }>(`/admin/currencies/${currencyId}`);
    return toCurrency(data.currency);
  } catch {
    return null;
  }
}

export async function createCurrency(data: CurrencyInput): Promise<Currency> {
  const created = await fetchApi<{ currency: BackendCurrency }>("/admin/currencies", {
    method: "POST",
    body: JSON.stringify(toPayload(data)),
  });
  return toCurrency(created.currency);
}

export async function updateCurrency(
  currencyId: string,
  data: Partial<CurrencyInput>,
): Promise<Currency> {
  const updated = await fetchApi<{ currency: BackendCurrency }>(`/admin/currencies/${currencyId}`, {
    method: "PATCH",
    body: JSON.stringify(toPayload(data)),
  });
  return toCurrency(updated.currency);
}

/** Soft-delete: currencies are deactivated, never removed, so history stays readable. */
export async function deactivateCurrency(currencyId: string): Promise<Currency> {
  const updated = await fetchApi<{ currency: BackendCurrency }>(
    `/admin/currencies/${currencyId}/deactivate`,
    { method: "POST" },
  );
  return toCurrency(updated.currency);
}
