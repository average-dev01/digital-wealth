"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { ArrowLeft, FileText, AlertTriangle, KeyRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { AdminField } from "@/components/admin/AdminField";
import { kycBadgeVariant, txBadgeVariant } from "@/components/admin/status";
import {
  getUserDetail,
  updateUser,
  updateUserKyc,
  adjustUserBalance,
  resetAccountKeyword,
  type UserDetail,
} from "@/lib/api/adminUsers";
import { getAllCurrencies } from "@/lib/api/currencies";
import { formatCryptoAmount, formatUsd } from "@/lib/market";
import { useCurrencies } from "@/hooks/useCurrencies";
import { Link } from "@/i18n/navigation";

type PendingAction =
  "suspend" | "reactivate" | "approve-kyc" | "reject-kyc" | "reset-keyword" | null;

export default function AdminUserDetail() {
  const { usdValue, formatCrypto } = useCurrencies();
  const params = useParams<{ id: string }>();
  const userId = params.id;
  const queryClient = useQueryClient();
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [adjusting, setAdjusting] = useState(false);

  const query = useQuery({
    queryKey: ["admin", "user", userId],
    enabled: Boolean(userId),
    queryFn: () => getUserDetail(userId),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "user", userId] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
  };

  const actionMutation = useMutation({
    mutationFn: async (action: Exclude<PendingAction, null>) => {
      if (action === "suspend") return updateUser(userId, { is_active: false });
      if (action === "reactivate") return updateUser(userId, { is_active: true });
      if (action === "approve-kyc") return updateUserKyc(userId, "verified");
      if (action === "reject-kyc") return updateUserKyc(userId, "rejected");
      return resetAccountKeyword(userId);
    },
    onSuccess: (_result, action) => {
      const messages: Record<Exclude<PendingAction, null>, string> = {
        suspend: "Account suspended.",
        reactivate: "Account reactivated.",
        "approve-kyc": "Verification approved.",
        "reject-kyc": "Verification rejected.",
        "reset-keyword": "Account keyword reset.",
      };
      toast.success(messages[action]);
      invalidate();
      setPendingAction(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not complete that action"),
  });

  if (query.isLoading) return <DetailSkeleton />;

  const detail = query.data;
  if (!detail) {
    return (
      <div className="space-y-6">
        <BackLink />
        <p className="surface-panel p-8 text-center text-sm text-muted-foreground">
          This customer could not be found.
        </p>
      </div>
    );
  }

  const { profile, wallets, transactions, kycDocuments } = detail;
  const portfolioUsd = wallets.reduce((sum, w) => sum + usdValue(w.currency, Number(w.balance)), 0);

  return (
    <div className="space-y-8">
      <BackLink />

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{profile.full_name ?? "Unnamed customer"}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{profile.email}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant={kycBadgeVariant(profile.kyc_status)} className="capitalize">
              KYC {profile.kyc_status}
            </Badge>
            <Badge variant={profile.is_active ? "secondary" : "destructive"}>
              {profile.is_active ? "Active" : "Suspended"}
            </Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setAdjusting(true)}>
            Adjust balance
          </Button>
          {profile.is_active ? (
            <Button variant="outline" onClick={() => setPendingAction("suspend")}>
              Suspend
            </Button>
          ) : (
            <Button variant="outline" onClick={() => setPendingAction("reactivate")}>
              Reactivate
            </Button>
          )}
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Portfolio value" value={formatUsd(portfolioUsd)} />
        <Stat label="Country" value={profile.country ?? "—"} />
        <Stat
          label="Date of birth"
          value={profile.dob ? format(new Date(profile.dob), "d MMM yyyy") : "—"}
        />
        <Stat label="Joined" value={format(new Date(profile.created_at), "d MMM yyyy")} />
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Identity verification</h2>
          {profile.kyc_status !== "verified" || kycDocuments.length > 0 ? (
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={profile.kyc_status === "verified"}
                onClick={() => setPendingAction("approve-kyc")}
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={profile.kyc_status === "rejected"}
                onClick={() => setPendingAction("reject-kyc")}
              >
                Reject
              </Button>
            </div>
          ) : null}
        </div>

        <div className="surface-panel p-5">
          {kycDocuments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              This customer has not submitted any identity documents yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {kycDocuments.map((doc) => (
                <li key={doc.id} className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <FileText className="size-4 shrink-0 text-primary" aria-hidden />
                    <div>
                      <p className="text-sm capitalize">{doc.doc_type.replace(/_/g, " ")}</p>
                      <p className="num text-xs text-muted-foreground">
                        {doc.storage_path ?? "No file recorded"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="num text-xs text-muted-foreground">
                      {format(new Date(doc.submitted_at), "d MMM yyyy")}
                    </span>
                    <Badge variant={kycBadgeVariant(doc.status)} className="capitalize">
                      {doc.status}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Account keyword</h2>
          {profile.account_keyword && (
            <Button size="sm" variant="outline" onClick={() => setPendingAction("reset-keyword")}>
              Reset keyword
            </Button>
          )}
        </div>
        <div className="surface-panel p-5">
          {profile.account_keyword ? (
            <div className="flex items-start gap-3">
              <KeyRound className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <div className="min-w-0">
                <p className="num break-words text-sm">{profile.account_keyword}</p>
                {profile.account_keyword_set_at && (
                  <p className="num mt-1 text-xs text-muted-foreground">
                    Set on {format(new Date(profile.account_keyword_set_at), "d MMM yyyy")}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              This customer has not submitted their account keyword yet.
            </p>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Wallet balances</h2>
        <div className="surface-panel overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset</TableHead>
                <TableHead className="text-end">Balance</TableHead>
                <TableHead className="text-end">Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {wallets.map((wallet) => (
                <TableRow key={wallet.id}>
                  <TableCell className="num font-semibold">{wallet.currency}</TableCell>
                  <TableCell className="num text-end">
                    {formatCrypto(wallet.currency, Number(wallet.balance))}
                  </TableCell>
                  <TableCell className="num text-end text-muted-foreground">
                    {formatUsd(usdValue(wallet.currency, Number(wallet.balance)))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Transaction history</h2>
        <div className="surface-panel overflow-x-auto">
          {transactions.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              No transactions on this account yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Asset</TableHead>
                  <TableHead className="text-end">Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="num whitespace-nowrap text-xs text-muted-foreground">
                      {format(new Date(tx.created_at), "d MMM yyyy, HH:mm")}
                    </TableCell>
                    <TableCell className="capitalize">{tx.type.replace(/_/g, " ")}</TableCell>
                    <TableCell className="num">{tx.currency}</TableCell>
                    <TableCell className="num text-end">
                      {formatCrypto(tx.currency, Number(tx.amount))}
                    </TableCell>
                    <TableCell>
                      <Badge variant={txBadgeVariant(tx.status)} className="capitalize">
                        {tx.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </section>

      {adjusting && (
        <AdjustBalanceDialog
          detail={detail}
          onClose={() => setAdjusting(false)}
          onSaved={() => {
            invalidate();
            setAdjusting(false);
          }}
        />
      )}

      <AlertDialog
        open={pendingAction !== null}
        onOpenChange={(open) => !open && setPendingAction(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingAction === "suspend" && "Suspend this account?"}
              {pendingAction === "reactivate" && "Reactivate this account?"}
              {pendingAction === "approve-kyc" && "Approve identity verification?"}
              {pendingAction === "reject-kyc" && "Reject identity verification?"}
              {pendingAction === "reset-keyword" && "Reset account keyword?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction === "suspend" &&
                `${profile.full_name ?? profile.email} will be refused a session at login until the account is reactivated. Balances and history are preserved.`}
              {pendingAction === "reactivate" &&
                `${profile.full_name ?? profile.email} will be able to sign in again.`}
              {pendingAction === "approve-kyc" &&
                "Confirm the submitted documents have been checked against the customer's details before approving."}
              {pendingAction === "reject-kyc" &&
                "The customer will be prompted to resubmit their verification details."}
              {pendingAction === "reset-keyword" &&
                "The current keyword will be cleared so the customer can enter a new one. Their existing keyword will no longer be shown here."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                if (pendingAction) actionMutation.mutate(pendingAction);
              }}
              disabled={actionMutation.isPending}
            >
              {actionMutation.isPending ? "Working…" : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/admin/users"
      className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-4" aria-hidden /> Back to users
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <article className="surface-panel p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="num mt-3 text-lg font-semibold">{value}</p>
    </article>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-9 w-64" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

/**
 * Manual ledger adjustment. Two-step (enter → confirm) like the customer
 * withdrawal dialog, because this writes a real ledger entry against the
 * customer's balance.
 */
function AdjustBalanceDialog({
  detail,
  onClose,
  onSaved,
}: {
  detail: UserDetail;
  onClose: () => void;
  onSaved: () => void;
}) {
  const currenciesQuery = useQuery({
    queryKey: ["admin", "currencies"],
    queryFn: getAllCurrencies,
  });
  const currencies = (currenciesQuery.data ?? []).filter((c) => c.is_active);

  const [currencyId, setCurrencyId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);

  const selected = currencies.find((c) => c.id === currencyId);
  const amountValue = Number(amount);
  const currentBalance = Number(
    detail.wallets.find((w) => w.currency === selected?.symbol)?.balance ?? 0,
  );

  const mutation = useMutation({
    mutationFn: () => adjustUserBalance(detail.profile.id, currencyId, amountValue, note.trim()),
    onSuccess: () => {
      toast.success("Balance adjusted and ledger entry recorded.");
      onSaved();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not adjust balance"),
  });

  function review() {
    const next: Record<string, string> = {};
    if (!currencyId) next["currency"] = "Select the asset to adjust";
    if (!Number.isFinite(amountValue) || amountValue === 0)
      next["amount"] = "Enter a non-zero amount (negative debits the wallet)";
    else if (selected && currentBalance + amountValue < 0)
      next["amount"] =
        `This would overdraw the wallet (balance ${formatCryptoAmount(currentBalance, selected.decimals)})`;
    if (note.trim().length < 4) next["note"] = "Record a reason for this adjustment";
    setErrors(next);
    if (Object.keys(next).length === 0) setConfirming(true);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{confirming ? "Confirm adjustment" : "Adjust balance"}</DialogTitle>
          <DialogDescription>
            {confirming
              ? "This writes a ledger entry against the customer's wallet."
              : `Manually credit or debit ${detail.profile.full_name ?? detail.profile.email}.`}
          </DialogDescription>
        </DialogHeader>

        {confirming && selected ? (
          <>
            <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs leading-relaxed text-muted-foreground">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              <p>
                Manual adjustments bypass the deposit and withdrawal queues. Make sure this
                correction is backed by a reconciled off-ledger movement.
              </p>
            </div>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Asset</dt>
                <dd className="num">{selected.symbol}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Adjustment</dt>
                <dd className="num">
                  {amountValue > 0 ? "+" : ""}
                  {formatCryptoAmount(amountValue, selected.decimals)} {selected.symbol}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">New balance</dt>
                <dd className="num">
                  {formatCryptoAmount(currentBalance + amountValue, selected.decimals)}{" "}
                  {selected.symbol}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Note</dt>
                <dd className="mt-1 text-xs">{note}</dd>
              </div>
            </dl>
          </>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="adjust-currency">Currency</Label>
              <Select value={currencyId} onValueChange={setCurrencyId}>
                <SelectTrigger id="adjust-currency" aria-invalid={Boolean(errors["currency"])}>
                  <SelectValue placeholder="Select an asset" />
                </SelectTrigger>
                <SelectContent>
                  {currencies.map((currency) => (
                    <SelectItem key={currency.id} value={currency.id}>
                      {currency.symbol} — {currency.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors["currency"] && (
                <p role="alert" className="text-sm text-destructive">
                  {errors["currency"]}
                </p>
              )}
            </div>

            <AdminField
              id="adjust-amount"
              label="Amount"
              value={amount}
              onChange={setAmount}
              error={errors["amount"]}
              inputMode="decimal"
              className="num"
              hint={
                selected
                  ? `Current balance ${formatCryptoAmount(currentBalance, selected.decimals)} ${selected.symbol}. Use a negative amount to debit.`
                  : "Use a negative amount to debit the wallet."
              }
            />

            <AdminField
              id="adjust-note"
              label="Note"
              value={note}
              onChange={setNote}
              error={errors["note"]}
              placeholder="Reason for this adjustment"
            />
          </div>
        )}

        <DialogFooter>
          {confirming ? (
            <>
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                Back
              </Button>
              <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
                {mutation.isPending ? "Applying…" : "Confirm adjustment"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={review}>Review adjustment</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
