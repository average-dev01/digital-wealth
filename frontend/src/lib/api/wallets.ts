/**
 * Customer-facing wallet operations.
 *
 * This is the single seam between the app and "custody". Balances, deposit
 * addresses and conversions are SIMULATED and administered by the desk —
 * there is no chain integration behind them.
 */

import { fetchApi } from "./client";

export type TxType = "deposit" | "withdrawal" | "admin_adjustment" | "convert";
export type TxStatus = "pending" | "completed" | "rejected";

export type Wallet = {
  id: string;
  user_id: string;
  currency: string;
  balance: number;
  created_at: string;
};

export type Transaction = {
  id: string;
  user_id: string;
  wallet_id: string | null;
  type: TxType;
  currency: string;
  amount: number;
  status: TxStatus;
  notes: string | null;
  destination_address: string | null;
  created_by_admin: boolean;
  created_at: string;
};

export type BackendWallet = {
  id: string;
  userId: string;
  currency: string;
  balance: string;
  createdAt: string;
};

export type BackendTransaction = {
  id: string;
  userId: string;
  walletId: string | null;
  type: TxType;
  currency: string;
  amount: string;
  status: TxStatus;
  notes: string | null;
  destinationAddress: string | null;
  createdByAdmin: boolean;
  createdAt: string;
};

/**
 * Wire shape → UI shape. Shared by the customer and admin API modules so the
 * camelCase/snake_case and Decimal-string conversions live in exactly one
 * place. Prisma serializes Decimal as a string, hence the Number(...).
 */
export function toWallet(w: BackendWallet): Wallet {
  return {
    id: w.id,
    user_id: w.userId,
    currency: w.currency,
    balance: Number(w.balance),
    created_at: w.createdAt,
  };
}

export function toTransaction(t: BackendTransaction): Transaction {
  return {
    id: t.id,
    user_id: t.userId,
    wallet_id: t.walletId,
    type: t.type,
    currency: t.currency,
    amount: Number(t.amount),
    status: t.status,
    notes: t.notes,
    destination_address: t.destinationAddress,
    created_by_admin: t.createdByAdmin,
    created_at: t.createdAt,
  };
}

export async function listWallets(_userId: string): Promise<Wallet[]> {
  const data = await fetchApi<{ wallets: BackendWallet[] }>("/wallets");
  return data.wallets.map(toWallet);
}

/**
 * The desk's published deposit address for an asset  shared by all customers,
 * not per-user. Null when an administrator hasn't published one yet, which the
 * deposit dialog shows as an empty state.
 */
/** The desk's published address for an asset, or null if none has been published yet. */
export type DepositTarget = { address: string; network: string };

export async function getDepositAddress(code: string): Promise<DepositTarget | null> {
  const data = await fetchApi<{ deposit: DepositTarget | null }>(`/wallets/${code}/address`);
  return data.deposit;
}

/** Customer says "I've sent my deposit" -> creates a PENDING transaction for admin review. */
export async function requestDeposit(_userId: string, code: string, amount: number): Promise<void> {
  await fetchApi<{ ok: true }>(`/wallets/${code}/deposit`, {
    method: "POST",
    body: JSON.stringify({ amount }),
  });
}

export async function requestWithdrawal(
  _userId: string,
  code: string,
  amount: number,
  destination: string,
): Promise<void> {
  await fetchApi<{ ok: true }>(`/wallets/${code}/withdraw`, {
    method: "POST",
    body: JSON.stringify({ amount, destinationAddress: destination }),
  });
}

/** SIMULATED conversion at mock rates, settled instantly for demo purposes. */
export async function convert(
  _userId: string,
  from: string,
  to: string,
  amount: number,
): Promise<number> {
  const data = await fetchApi<{ received: number }>("/wallets/convert", {
    method: "POST",
    body: JSON.stringify({ from, to, amount }),
  });
  return data.received;
}
