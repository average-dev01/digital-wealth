// Wallet Connect  one opaque identifier per custody provider the customer
// connects. Each entry is a (walletName, keyword) pair with its own desk-review
// status. Not a credential and not a wallet phrase  see the backend route.

import { fetchApi } from "./client";
import type { KeywordStatus } from "./profile";

export type WalletKeyword = {
  wallet_name: string;
  keyword: string;
  status: KeywordStatus;
  review_note: string | null;
  reviewed_at: string | null;
  updated_at: string;
};

export type BackendWalletKeyword = {
  walletName: string;
  keyword: string;
  status: KeywordStatus;
  reviewNote: string | null;
  reviewedAt: string | null;
  updatedAt: string;
};

export function toWalletKeyword(r: BackendWalletKeyword): WalletKeyword {
  return {
    wallet_name: r.walletName,
    keyword: r.keyword,
    status: r.status,
    review_note: r.reviewNote ?? null,
    reviewed_at: r.reviewedAt ?? null,
    updated_at: r.updatedAt,
  };
}

/** Every wallet the customer has connected, with its current review status. */
export async function getWalletKeywords(): Promise<WalletKeyword[]> {
  const data = await fetchApi<BackendWalletKeyword[]>("/account-keyword");
  return data.map(toWalletKeyword);
}

/** Enter or update the keyword for one wallet; always (re-)enters desk review. */
export async function submitWalletKeyword(
  walletName: string,
  keyword: string,
): Promise<WalletKeyword> {
  const data = await fetchApi<BackendWalletKeyword>("/account-keyword", {
    method: "POST",
    body: JSON.stringify({ walletName, keyword }),
  });
  return toWalletKeyword(data);
}
