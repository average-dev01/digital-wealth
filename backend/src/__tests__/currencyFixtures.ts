/**
 * Test-only currency catalogue. The app itself ships no hardcoded asset list
 *  a real catalogue is created by an administrator through the admin panel 
 * but the suite needs assets to exist before it can provision wallets or move
 * balances, so setup.ts writes these rows into the test database.
 */
export const CURRENCY_FIXTURES = [
  {
    symbol: "BTC",
    name: "Bitcoin",
    decimals: 8,
    icon: "₿",
    mockPriceUsd: 96420.35,
    network: "Bitcoin",
  },
  {
    symbol: "ETH",
    name: "Ethereum",
    decimals: 8,
    icon: "Ξ",
    mockPriceUsd: 3412.88,
    network: "Ethereum (ERC-20)",
  },
  {
    symbol: "USDT",
    name: "Tether",
    decimals: 2,
    icon: "₮",
    mockPriceUsd: 1.0,
    network: "Ethereum (ERC-20)",
  },
] as const;
