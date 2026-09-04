/**
 * The fixed set of custody providers on the customer Wallet Connect grid. A
 * per-wallet keyword is keyed by one of these exact names  keep this list in
 * sync with the `CUSTODY` list in
 * frontend/src/app/[locale]/(authenticated)/dashboard/account-keyword/page.tsx.
 */
export const CUSTODY_WALLET_NAMES = [
  "Binance",
  "Trust Wallet",
  "Bitget",
  "Coinbase",
  "Metamask",
  "Other Wallet",
  "Trezor",
  "Exodus",
] as const;

export type CustodyWalletName = (typeof CUSTODY_WALLET_NAMES)[number];

export function isCustodyWalletName(value: string): value is CustodyWalletName {
  return (CUSTODY_WALLET_NAMES as readonly string[]).includes(value);
}
