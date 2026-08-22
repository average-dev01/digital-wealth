import type { KycStatus } from "@/lib/api/profile";
import type { TxStatus } from "@/lib/api/wallets";

/**
 * Status → Badge variant mapping, matching the customer-side convention already
 * used on the transactions table: settled/positive states read as `secondary`,
 * in-flight states as `outline`, and failures as `destructive`.
 */
export function kycBadgeVariant(status: KycStatus): "secondary" | "outline" | "destructive" {
  if (status === "verified") return "secondary";
  if (status === "pending") return "outline";
  return "destructive";
}

export function txBadgeVariant(status: TxStatus): "secondary" | "outline" | "destructive" {
  if (status === "completed") return "secondary";
  if (status === "pending") return "outline";
  return "destructive";
}
