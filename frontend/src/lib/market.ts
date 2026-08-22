/**
 * Presentation helpers for money, plus the static asset list the public
 * marketing pages advertise.
 *
 * This file deliberately holds NO data the signed-in app reads. Wallet
 * balances, prices, decimals and asset names all come from the database via
 * `useCurrencies()` — an administrator can add an asset and it renders
 * correctly with no change here. What remains below is either pure
 * formatting, or build-time marketing copy for the public pages, which are
 * statically prerendered and so cannot depend on a running backend.
 */

/** Marketing copy only — the assets the public site advertises. NOT the live catalogue. */
export type MarketingAsset = {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
  network: string;
  minDeposit: number;
  displayPriceUsd: number;
  /** Static illustrative 24h figure — marketing pages are prerendered. */
  displayChange24h: number;
  chart: number;
};

export const MARKETING_ASSETS: MarketingAsset[] = [
  {
    code: "BTC",
    name: "Bitcoin",
    symbol: "₿",
    decimals: 8,
    network: "Bitcoin",
    minDeposit: 0.0005,
    displayPriceUsd: 96420.35,
    displayChange24h: 0.22,
    chart: 1,
  },
  {
    code: "ETH",
    name: "Ethereum",
    symbol: "Ξ",
    decimals: 8,
    network: "Ethereum (ERC-20)",
    minDeposit: 0.01,
    displayPriceUsd: 3412.88,
    displayChange24h: 0.8,
    chart: 2,
  },
  {
    code: "USDT",
    name: "Tether",
    symbol: "₮",
    decimals: 2,
    network: "Ethereum (ERC-20)",
    minDeposit: 20,
    displayPriceUsd: 1.0,
    displayChange24h: 0.01,
    chart: 3,
  },
  {
    code: "USDC",
    name: "USD Coin",
    symbol: "$",
    decimals: 2,
    network: "Ethereum (ERC-20)",
    minDeposit: 20,
    displayPriceUsd: 1.0,
    displayChange24h: 0.0,
    chart: 4,
  },
  {
    code: "SOL",
    name: "Solana",
    symbol: "◎",
    decimals: 6,
    network: "Solana",
    minDeposit: 0.1,
    displayPriceUsd: 184.21,
    displayChange24h: 1.45,
    chart: 5,
  },
  {
    code: "BNB",
    name: "BNB",
    symbol: "B",
    decimals: 6,
    network: "BNB Smart Chain (BEP-20)",
    minDeposit: 0.02,
    displayPriceUsd: 642.7,
    displayChange24h: -0.62,
    chart: 6,
  },
  {
    code: "XRP",
    name: "XRP",
    symbol: "✕",
    decimals: 6,
    network: "XRP Ledger",
    minDeposit: 10,
    displayPriceUsd: 2.34,
    displayChange24h: 2.1,
    chart: 7,
  },
];

/** Stable chart colour per asset, by position in the live catalogue. */
export function chartToken(index: number): number {
  return (index % 7) + 1;
}

export function formatUsd(value: number, opts?: { compact?: boolean }): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: opts?.compact ? "compact" : "standard",
    maximumFractionDigits: opts?.compact ? 1 : 2,
    minimumFractionDigits: opts?.compact ? 0 : 2,
  }).format(Number.isFinite(value) ? value : 0);
}

/** Takes decimals directly — the caller resolves them from the live catalogue. */
export function formatCryptoAmount(amount: number, decimals: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: Math.min(decimals, 2),
    maximumFractionDigits: decimals,
  }).format(Number.isFinite(amount) ? amount : 0);
}

export function formatPercent(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}
