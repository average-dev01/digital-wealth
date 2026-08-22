// The deposit and withdrawal review queues. Approving a deposit or completing
// a withdrawal moves the customer's simulated balance, so the backend settles
// the ledger and the transaction row together in one DB transaction.

import { fetchApi } from "./client";
import type { KycStatus, Profile } from "./profile";
import { toTransaction, type BackendTransaction, type Transaction } from "./wallets";

export type { Transaction };

/** Uppercase at this layer; the API takes the lowercase enum value. */
export type QueueType = "DEPOSIT" | "WITHDRAWAL";

export type ReviewDecision = {
  status: "completed" | "rejected";
  note?: string | undefined;
};

/** A queue row joined with the customer it belongs to, so the table needs one call. */
export type PendingTransaction = Transaction & {
  user: Pick<Profile, "id" | "email" | "full_name" | "kyc_status"> | null;
};

type BackendPendingTransaction = BackendTransaction & {
  user: { id: string; email: string; fullName: string; kycStatus: KycStatus } | null;
};

export async function getPendingTransactions(type: QueueType): Promise<PendingTransaction[]> {
  const data = await fetchApi<{ transactions: BackendPendingTransaction[] }>(
    `/admin/transactions/pending?type=${type.toLowerCase()}`,
  );

  return data.transactions.map((row) => ({
    ...toTransaction(row),
    user: row.user
      ? {
          id: row.user.id,
          email: row.user.email,
          full_name: row.user.fullName || null,
          kyc_status: row.user.kycStatus,
        }
      : null,
  }));
}

/**
 * Settle a pending request. `completed` moves the balance (credit for a
 * deposit, debit for a withdrawal); `rejected` only marks the row and leaves
 * the balance alone.
 */
export async function reviewTransaction(
  txId: string,
  decision: ReviewDecision,
): Promise<Transaction> {
  const data = await fetchApi<{ transaction: BackendPendingTransaction }>(
    `/admin/transactions/${txId}/review`,
    {
      method: "POST",
      body: JSON.stringify({
        status: decision.status,
        ...(decision.note?.trim() ? { note: decision.note.trim() } : {}),
      }),
    },
  );
  return toTransaction(data.transaction);
}
