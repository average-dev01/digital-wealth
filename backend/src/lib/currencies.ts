/**
 * Currency catalogue. The `currencies` table is the sole source of truth —
 * admins create, edit and deactivate assets through the admin panel, and
 * wallet provisioning follows. There is no hardcoded asset list here: an
 * empty catalogue means customers have no wallets until an admin adds one.
 *
 * PRICES: `mockPriceUsd` is real for currencies whose `priceSource` is `live`
 * — `lib/priceFeed.ts` overwrites it from the market data provider and calls
 * `invalidateCurrencyCache()` so the new figure is visible at once. `manual`
 * currencies keep whatever an admin typed. The column name is historical.
 */
import { prisma } from "./prisma";

export type CurrencyMeta = {
  code: string;
  name: string;
  decimals: number;
  icon: string | null;
  iconUrl: string | null;
  mockPriceUsd: number;
};

/**
 * Short-lived cache: the active catalogue is read on every wallet listing but
 * changes only when an admin edits it, so the admin routes call
 * `invalidateCurrencyCache()` after a write to make changes visible at once
 * rather than waiting out the TTL.
 */
const CACHE_TTL_MS = 30_000;
let cache: { at: number; rows: CurrencyMeta[] } | null = null;

export function invalidateCurrencyCache(): void {
  cache = null;
}

function toMeta(row: {
  symbol: string;
  name: string;
  decimals: number;
  icon: string | null;
  iconUrl: string | null;
  mockPriceUsd: unknown;
}): CurrencyMeta {
  return {
    code: row.symbol,
    name: row.name,
    decimals: row.decimals,
    icon: row.icon,
    iconUrl: row.iconUrl,
    mockPriceUsd: Number(row.mockPriceUsd),
  };
}

export async function getActiveCurrencies(): Promise<CurrencyMeta[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.rows;

  const rows = await prisma.currency.findMany({
    where: { isActive: true },
    orderBy: [{ createdAt: "asc" }, { symbol: "asc" }],
  });
  const mapped = rows.map(toMeta);

  cache = { at: Date.now(), rows: mapped };
  return mapped;
}

export async function getCurrency(code: string): Promise<CurrencyMeta | undefined> {
  return (await getActiveCurrencies()).find((c) => c.code === code);
}

export async function isValidCurrency(code: string): Promise<boolean> {
  return (await getCurrency(code)) !== undefined;
}
