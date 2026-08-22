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

export default function AdminDeposits() {
  const queryClient = useQueryClient();
  const { usdValue, formatCrypto } = useCurrencies();
  const [decision, setDecision] = useState<{
    tx: PendingTransaction;
    status: "completed" | "rejected";
  } | null>(null);

  const query = useQuery({
    queryKey: ["admin", "pending", "DEPOSIT"],
    queryFn: () => getPendingTransactions("DEPOSIT"),
  });

  const mutation = useMutation({
    mutationFn: ({ tx, status }: { tx: PendingTransaction; status: "completed" | "rejected" }) =>
      reviewTransaction(tx.id, {
        status,
        note:
          status === "completed"
            ? "Deposit confirmed on-chain and credited by administrator"
            : "Deposit claim rejected by administrator",
      }),
    onSuccess: (_result, variables) => {
      toast.success(
        variables.status === "completed" ? "Deposit approved and credited." : "Deposit rejected.",
      );
      void queryClient.invalidateQueries({ queryKey: ["admin", "pending", "DEPOSIT"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "user"] });
      setDecision(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not review this deposit"),
  });

  const rows = query.data ?? [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Deposit review</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Customer-declared deposits awaiting confirmation. Approving credits the customer&apos;s
          wallet.
        </p>
      </header>

      <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm leading-relaxed text-muted-foreground">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
        <p>
          These are customer-declared amounts, not verified receipts. Confirm every transfer on a
          block explorer before approving it.
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
            No deposits are waiting for review. New customer deposit claims will appear here.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Asset</TableHead>
                <TableHead className="text-end">Claimed amount</TableHead>
                <TableHead>Submitted</TableHead>
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
                  <TableCell className="num whitespace-nowrap text-xs text-muted-foreground">
                    {format(new Date(tx.created_at), "d MMM yyyy, HH:mm")}
                  </TableCell>
                  <TableCell className="text-end">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" onClick={() => setDecision({ tx, status: "completed" })}>
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDecision({ tx, status: "rejected" })}
                      >
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

      <AlertDialog open={decision !== null} onOpenChange={(open) => !open && setDecision(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {decision?.status === "completed" ? "Approve this deposit?" : "Reject this deposit?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {decision?.status === "completed"
                ? `${formatCrypto(decision.tx.currency, Number(decision.tx.amount))} ${decision.tx.currency} will be credited to ${decision.tx.user?.full_name ?? "this customer"}'s wallet immediately.`
                : "The customer's deposit claim will be marked rejected. No funds move."}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {decision?.status === "completed" && (
            <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs leading-relaxed text-muted-foreground">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              <p>
                Confirm this transfer on a block explorer before approving. The screenshot alone is
                not proof the funds arrived.
              </p>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                if (decision) mutation.mutate(decision);
              }}
              disabled={mutation.isPending}
            >
              {mutation.isPending
                ? "Working…"
                : decision?.status === "completed"
                  ? "Approve and credit"
                  : "Reject deposit"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
