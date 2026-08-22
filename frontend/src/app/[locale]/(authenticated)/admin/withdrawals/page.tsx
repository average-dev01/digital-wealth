"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  getPendingTransactions,
  reviewTransaction,
  type PendingTransaction,
} from "@/lib/api/adminTransactions";
import { formatUsd } from "@/lib/market";
import { useCurrencies } from "@/hooks/useCurrencies";
import { Link } from "@/i18n/navigation";

export default function AdminWithdrawals() {
  const queryClient = useQueryClient();
  const { usdValue, formatCrypto } = useCurrencies();
  const [completing, setCompleting] = useState<PendingTransaction | null>(null);
  const [rejecting, setRejecting] = useState<PendingTransaction | null>(null);

  const query = useQuery({
    queryKey: ["admin", "pending", "WITHDRAWAL"],
    queryFn: () => getPendingTransactions("WITHDRAWAL"),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "pending", "WITHDRAWAL"] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "user"] });
  };

  const completeMutation = useMutation({
    mutationFn: (tx: PendingTransaction) =>
      reviewTransaction(tx.id, {
        status: "completed",
        note: "Withdrawal completed by administrator",
      }),
    onSuccess: () => {
      toast.success("Withdrawal completed and wallet debited.");
      invalidate();
      setCompleting(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not complete withdrawal"),
  });

  const rejectMutation = useMutation({
    mutationFn: (tx: PendingTransaction) =>
      reviewTransaction(tx.id, {
        status: "rejected",
        note: "Withdrawal request rejected by administrator",
      }),
    onSuccess: () => {
      toast.success("Withdrawal rejected. No funds moved.");
      invalidate();
      setRejecting(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not reject this request"),
  });

  const rows = query.data ?? [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Withdrawal review</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Pending payout requests. Completing one debits the customer&apos;s wallet.
        </p>
      </header>

      <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm leading-relaxed text-muted-foreground">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
        <p>
          Check the destination address against the customer&apos;s verified details before sending.
          Outbound transfers cannot be reversed.
        </p>
      </div>

      <div className="surface-panel overflow-x-auto">
        {query.isLoading ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            No withdrawals are waiting for review. New payout requests will appear here.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Asset</TableHead>
                <TableHead className="text-end">Amount</TableHead>
                <TableHead>Destination address</TableHead>
                <TableHead>Requested</TableHead>
                <TableHead className="text-end">Review</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell>
                    {tx.user ? (
                      <Link
                        href={`/admin/users/${tx.user.id}`}
                        className="text-sm hover:text-primary"
                      >
                        <span className="block font-medium">{tx.user.full_name ?? "—"}</span>
                        <span className="block text-xs text-muted-foreground">{tx.user.email}</span>
                      </Link>
                    ) : (
                      <span className="text-sm text-muted-foreground">Unknown</span>
                    )}
                  </TableCell>
                  <TableCell className="num font-semibold">{tx.currency}</TableCell>
                  <TableCell className="num text-end">
                    <span className="block">{formatCrypto(tx.currency, Number(tx.amount))}</span>
                    <span className="block text-xs text-muted-foreground">
                      {formatUsd(usdValue(tx.currency, Number(tx.amount)))}
                    </span>
                  </TableCell>
                  <TableCell
                    className="num max-w-[14rem] truncate text-xs"
                    title={tx.destination_address ?? ""}
                  >
                    {tx.destination_address ?? "—"}
                  </TableCell>
                  <TableCell className="num whitespace-nowrap text-xs text-muted-foreground">
                    {format(new Date(tx.created_at), "d MMM yyyy, HH:mm")}
                  </TableCell>
                  <TableCell className="text-end">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" onClick={() => setCompleting(tx)}>
                        Complete
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setRejecting(tx)}>
                        Reject
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <AlertDialog open={completing !== null} onOpenChange={(open) => !open && setCompleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Complete this withdrawal?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              {completing ? (
                <div className="space-y-3">
                  <p>
                    Only complete this once you have already sent the funds — the app records the
                    payout, it does not send anything itself.
                  </p>
                  <span className="block rounded-lg border border-border p-3 text-sm">
                    <span className="num block font-semibold text-foreground">
                      {formatCrypto(completing.currency, Number(completing.amount))}{" "}
                      {completing.currency}
                    </span>
                    <span className="mt-1 block text-xs">
                      to {completing.user?.full_name ?? "this customer"}
                    </span>
                    <span className="num mt-2 block break-all text-xs">
                      {completing.destination_address ?? "—"}
                    </span>
                  </span>
                  <p>Their wallet will be debited by this amount.</p>
                </div>
              ) : (
                <span />
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                if (completing) completeMutation.mutate(completing);
              }}
              disabled={completeMutation.isPending}
            >
              {completeMutation.isPending ? "Working…" : "Complete withdrawal"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={rejecting !== null} onOpenChange={(open) => !open && setRejecting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject this withdrawal?</AlertDialogTitle>
            <AlertDialogDescription>
              {rejecting
                ? `${rejecting.user?.full_name ?? "The customer"}'s request for ${formatCrypto(rejecting.currency, Number(rejecting.amount))} ${rejecting.currency} will be marked rejected. Their balance is untouched.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                if (rejecting) rejectMutation.mutate(rejecting);
              }}
              disabled={rejectMutation.isPending}
            >
              {rejectMutation.isPending ? "Working…" : "Reject withdrawal"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
