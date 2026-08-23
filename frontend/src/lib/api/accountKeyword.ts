// The account keyword: an opaque identifier the customer is issued out-of-band
// and enters once. Not a credential and not a wallet phrase  see the backend
// route for the full note. One-time: the backend 409s a second submit.

import { fetchApi } from "./client";

export type AccountKeywordResult = {
  account_keyword: string;
  account_keyword_set_at: string;
};

export async function submitAccountKeyword(keyword: string): Promise<AccountKeywordResult> {
  const data = await fetchApi<{ accountKeyword: string; accountKeywordSetAt: string }>(
    "/account-keyword",
    { method: "POST", body: JSON.stringify({ keyword }) },
  );
  return {
    account_keyword: data.accountKeyword,
    account_keyword_set_at: data.accountKeywordSetAt,
  };
}
