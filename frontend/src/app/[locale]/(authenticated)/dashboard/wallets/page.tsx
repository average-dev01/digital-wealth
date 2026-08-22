"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Copy, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import {
  listWallets,
  getDepositAddress,
  requestDeposit,
  requestWithdrawal,
  convert,
} from "@/lib/api/wallets";
import { formatUsd } from "@/lib/market";
import { CurrencyIcon } from "@/components/CurrencyIcon";
import { useCurrencies } from "@/hooks/useCurrencies";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Flow = { kind: "deposit" | "withdraw"; code: string } | null;

export default function Wallets() {
  const t = useTranslations("wallets");
  const { user } = useAuth();
  const { getCurrency, usdValue, formatCrypto, isActive } = useCurrencies();
  const queryClient = useQueryClient();
  const [flow, setFlow] = useState<Flow>(null);

  const walletsQuery = useQuery({
    queryKey: ["wallets", user?.id],
    enabled: Boolean(user?.id),
    queryFn: () => listWallets(user!.id),
  });

  const wallets = walletsQuery.data ?? [];
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["wallets", user?.id] });
    void queryClient.invalidateQueries({ queryKey: ["transactions", user?.id] });
  };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>

      {walletsQuery.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {wallets.map((wallet) => {
            const meta = getCurrency(wallet.currency);
            // A delisted asset keeps its card so the customer can still see
            // and withdraw the balance; only new deposits are closed off.
            const depositsOpen = isActive(wallet.currency);
            return (
              <article key={wallet.id} className="surface-panel flex flex-col p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="num text-sm font-semibold">{wallet.currency}</p>
                    <p className="text-xs text-muted-foreground">{meta?.name ?? wallet.currency}</p>
                  </div>
                  <CurrencyIcon
                    code={wallet.currency}
                    iconUrl={meta?.icon_url}
                    icon={meta?.icon}
                    size={32}
                  />
                </div>
                <p className="num mt-5 text-xl font-semibold">
                  {formatCrypto(wallet.currency, Number(wallet.balance))}
                </p>
                <p className="num mt-1 text-sm text-muted-foreground">
                  ≈ {formatUsd(usdValue(wallet.currency, Number(wallet.balance)))}
                </p>
                {!depositsOpen && <p className="mt-3 text-xs text-warning">{t("delisted")}</p>}
                <div className="mt-5 flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1"
                    disabled={!depositsOpen}
                    onClick={() => setFlow({ kind: "deposit", code: wallet.currency })}
                  >
                    {t("deposit")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setFlow({ kind: "withdraw", code: wallet.currency })}
                  >
                    {t("withdraw")}
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <ConvertPanel onDone={invalidate} />

      {flow?.kind === "deposit" && (
        <DepositDialog code={flow.code} onClose={() => setFlow(null)} onDone={invalidate} />
      )}
      {flow?.kind === "withdraw" && (
        <WithdrawDialog
          code={flow.code}
          balance={Number(wallets.find((w) => w.currency === flow.code)?.balance ?? 0)}
          onClose={() => setFlow(null)}
          onDone={invalidate}
        />
      )}
    </div>
  );
}

function DepositDialog({
  code,
  onClose,
  onDone,
}: {
  code: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations("wallets");
  const { user } = useAuth();
  const { usdValue } = useCurrencies();
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);

  // What the customer is actually sending, in dollars, at the live rate. The
  // deposit dialog had no USD figure at all before — an accurate price is no
  // use if the amount is never valued in front of the person typing it.
  const parsedAmount = Number(amount);
  const showValue = amount.trim() !== "" && Number.isFinite(parsedAmount) && parsedAmount > 0;

  // One shared desk address per asset, so this isn't scoped to the user.
  const addressQuery = useQuery({
    queryKey: ["deposit-address", code],
    queryFn: () => getDepositAddress(code),
  });
  // null (not undefined) means the query resolved and the desk simply hasn't
  // published an address for this asset yet.
  const noAddressPublished = addressQuery.isSuccess && addressQuery.data === null;

  const deposit = addressQuery.data ?? null;

  useEffect(() => {
    if (!deposit) return;
    // The desk's published address, rendered as a real scannable QR.
    void QRCode.toDataURL(deposit.address, {
      margin: 1,
      width: 220,
      color: { dark: "#0d1117", light: "#ffffff" },
    }).then(setQr);
  }, [deposit]);

  const mutation = useMutation({
    mutationFn: async () => {
      const value = Number(amount);
      await requestDeposit(user!.id, code, value);
    },
    onSuccess: () => {
      toast.success(t("depositSubmitted"));
      onDone();
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("depositError")),
  });

  function submit() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError(t("amountSentError"));
      return;
    }
    setError(null);
    mutation.mutate();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("depositTitle", { code })}</DialogTitle>
          <DialogDescription>
            {t("depositDescription", {
              code,
              network: deposit?.network ?? t("networkFallback"),
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {noAddressPublished ? (
            <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm leading-relaxed text-muted-foreground">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              <p>{t("noAddress", { code })}</p>
            </div>
          ) : (
            <>
              <div className="flex justify-center">
                {qr ? (
                  // Plain <img>: the QR is a runtime-generated data: URI, not a
                  // static asset, so next/image would add nothing here.
                  <img
                    src={qr}
                    alt={t("qrAlt", { code })}
                    width={200}
                    height={200}
                    className="rounded-lg"
                  />
                ) : (
                  <Skeleton className="size-[200px] rounded-lg" />
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="deposit-address">{t("addressLabel")}</Label>
                <div className="flex gap-2">
                  <Input
                    id="deposit-address"
                    readOnly
                    value={deposit?.address ?? ""}
                    className="num text-xs"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label={t("copyAddress")}
                    onClick={() => {
                      void navigator.clipboard.writeText(deposit?.address ?? "");
                      toast.success(t("addressCopied"));
                    }}
                  >
                    <Copy className="size-4" aria-hidden />
                  </Button>
                </div>
              </div>
            </>
          )}

          <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs leading-relaxed text-muted-foreground">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <p>
              {deposit
                ? t("depositWarningWithNetwork", { code, network: deposit.network })
                : t("depositWarning", { code })}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="deposit-amount">{t("amountSent")}</Label>
            <Input
              id="deposit-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "deposit-error" : undefined}
            />
            {showValue && (
              <p className="flex justify-between gap-4 text-sm">
                <span className="text-muted-foreground">{t("value")}</span>
                <span className="num">{formatUsd(usdValue(code, parsedAmount))}</span>
              </p>
            )}
            {error && (
              <p id="deposit-error" role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button onClick={submit} disabled={mutation.isPending || noAddressPublished}>
            {mutation.isPending ? t("submitting") : t("confirmDeposit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WithdrawDialog({
  code,
  balance,
  onClose,
  onDone,
}: {
  code: string;
  balance: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations("wallets");
  const { user } = useAuth();
  const { formatCrypto, usdValue } = useCurrencies();
  const [address, setAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [errors, setErrors] = useState<{ address?: string; amount?: string }>({});
  const [confirming, setConfirming] = useState(false);

  const mutation = useMutation({
    mutationFn: () => requestWithdrawal(user!.id, code, Number(amount), address.trim()),
    onSuccess: () => {
      toast.success(t("withdrawalSubmitted"));
      onDone();
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("withdrawalError")),
  });

  function review() {
    const next: { address?: string; amount?: string } = {};
    if (address.trim().length < 12) next.address = t("errors.address");
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) next.amount = t("errors.amountPositive");
    else if (value > balance) next.amount = t("errors.amountExceeds");
    setErrors(next);
    if (Object.keys(next).length === 0) setConfirming(true);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {confirming ? t("confirmWithdrawalTitle") : t("withdrawTitle", { code })}
          </DialogTitle>
          <DialogDescription>
            {confirming
              ? t("confirmWithdrawalDescription")
              : t("available", { amount: formatCrypto(code, balance), code })}
          </DialogDescription>
        </DialogHeader>

        {confirming ? (
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{t("asset")}</dt>
              <dd className="num">{code}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{t("amount")}</dt>
              <dd className="num">
                {formatCrypto(code, Number(amount))} {code}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{t("value")}</dt>
              <dd className="num">{formatUsd(usdValue(code, Number(amount)))}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("destination")}</dt>
              <dd className="num mt-1 break-all text-xs">{address}</dd>
            </div>
          </dl>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="withdraw-address">{t("destinationAddress")}</Label>
              <Input
                id="withdraw-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="num text-xs"
                aria-invalid={Boolean(errors.address)}
                aria-describedby={errors.address ? "withdraw-address-error" : undefined}
              />
              {errors.address && (
                <p id="withdraw-address-error" role="alert" className="text-sm text-destructive">
                  {errors.address}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="withdraw-amount">{t("amount")}</Label>
              <Input
                id="withdraw-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-invalid={Boolean(errors.amount)}
                aria-describedby={errors.amount ? "withdraw-amount-error" : undefined}
              />
              {errors.amount && (
                <p id="withdraw-amount-error" role="alert" className="text-sm text-destructive">
                  {errors.amount}
                </p>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          {confirming ? (
            <>
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                {t("back")}
              </Button>
              <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
                {mutation.isPending ? t("submitting") : t("confirmRequest")}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose}>
                {t("cancel")}
              </Button>
              <Button onClick={review}>{t("reviewRequest")}</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConvertPanel({ onDone }: { onDone: () => void }) {
  const t = useTranslations("wallets");
  const { user } = useAuth();
  const { activeCurrencies, getCurrency, formatCrypto } = useCurrencies();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");

  // Defaults come from whatever the desk actually lists, not a fixed pair.
  useEffect(() => {
    if (activeCurrencies.length < 2) return;
    setFrom((current) => current || activeCurrencies[0]!.symbol);
    setTo((current) => current || activeCurrencies[1]!.symbol);
  }, [activeCurrencies]);

  const fromMeta = getCurrency(from);
  const toMeta = getCurrency(to);
  const rate =
    fromMeta && toMeta && toMeta.mock_price_usd > 0
      ? fromMeta.mock_price_usd / toMeta.mock_price_usd
      : 0;
  const receive = Number(amount) > 0 ? Number(amount) * rate : 0;

  const mutation = useMutation({
    mutationFn: () => convert(user!.id, from, to, Number(amount)),
    onSuccess: (received) => {
      toast.success(t("convertSuccess", { amount: formatCrypto(to, received), code: to }));
      setAmount("");
      onDone();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("convertError")),
  });

  // Nothing to convert between until at least two assets are listed. Checked
  // after every hook has run — bailing earlier would change hook order.
  if (activeCurrencies.length < 2) return null;

  return (
    <section aria-labelledby="convert-heading" className="surface-panel p-6">
      <h2 id="convert-heading" className="text-lg font-semibold">
        {t("convertHeading")}
      </h2>
      <p className="mt-1.5 text-sm text-muted-foreground">{t("convertSubtitle")}</p>

      <div className="mt-5 grid gap-4 sm:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="convert-amount">{t("amount")}</Label>
          <Input
            id="convert-amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="convert-from">{t("from")}</Label>
          <Select value={from} onValueChange={setFrom}>
            <SelectTrigger id="convert-from">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {activeCurrencies.map((c) => (
                <SelectItem key={c.id} value={c.symbol}>
                  {c.symbol}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="convert-to">{t("to")}</Label>
          <Select value={to} onValueChange={setTo}>
            <SelectTrigger id="convert-to">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {activeCurrencies
                .filter((c) => c.symbol !== from)
                .map((c) => (
                  <SelectItem key={c.id} value={c.symbol}>
                    {c.symbol}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <Button
            className="w-full"
            disabled={mutation.isPending || from === to || Number(amount) <= 0}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? t("converting") : t("convert")}
          </Button>
        </div>
      </div>

      <p className="num mt-4 text-sm text-muted-foreground">
        {t("convertResult", {
          receive: formatCrypto(to, receive),
          to,
          from,
          rate: formatCrypto(to, rate),
        })}
      </p>
    </section>
  );
}
