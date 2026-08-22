import { fetchApi } from "./client";
import { toTransaction, type BackendTransaction, type Transaction } from "./wallets";

export type { Transaction };

export async function listTransactions(_userId: string): Promise<Transaction[]> {
  const data = await fetchApi<{ transactions: BackendTransaction[] }>("/wallets/transactions");
  return data.transactions.map(toTransaction);
}
