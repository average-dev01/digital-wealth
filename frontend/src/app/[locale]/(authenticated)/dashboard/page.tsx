"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { listWallets } from "@/lib/api/wallets";
import { listTransactions } from "@/lib/api/transactions";
import { formatPercent, formatUsd } from "@/lib/market";
import { useCurrencies } from "@/hooks/useCurrencies";
import { useDateTimeFormat } from "@/hooks/useDateTimeFormat";
import { cn } from "@/lib/utils";
import { Link } from "@/i18n/navigation";

export default function Overview() {
  const t = useTranslations("overview");
  const tc = useTranslations("common");
  const { user } = useAuth();
  const { usdValue, formatCrypto, change24h: changeFor, pricesUpdatedAt } = useCurrencies();
  const dateFormat = useDateTimeFormat();
  const walletsQuery = useQuery({
    queryKey: ["wallets", user?.id],
    enabled: Boolean(user?.id),
    queryFn: () => listWallets(user!.id),
  });
  const txQuery = useQuery({
    queryKey: ["transactions", user?.id],
    enabled: Boolean(user?.id),
    queryFn: () => listTransactions(user!.id),
  });

  const wallets = walletsQuery.data ?? [];
  const holdings = wallets
    .map((w) => ({
      code: w.currency,
      amount: Number(w.balance),
      usd: usdValue(w.currency, Number(w.balance)),
    }))
    .filter((h) => h.usd > 0)
    .sort((a, b) => b.usd - a.usd);

  const total = holdings.reduce((sum, h) => sum + h.usd, 0);

  // Value-weighted 24h change from real per-asset figures. Assets with no
  // change data (manual/demo ones, or any never refreshed) are excluded from
  // BOTH sides of the average — counting them as 0% would drag the portfolio
  // figure toward zero and understate a real move.
  const rated = holdings
    .map((h) => ({ usd: h.usd, change: changeFor(h.code) }))
    .filter((h): h is { usd: number; change: number } => h.change !== null);
  const ratedTotal = rated.reduce((sum, h) => sum + h.usd, 0);
  const change24h =
    ratedTotal > 0 ? rated.reduce((sum, h) => sum + h.change * (h.usd / ratedTotal), 0) : 0;
  const hasChangeData = ratedTotal > 0;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="surface-panel p-6 sm:col-span-1">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {t("totalValue")}
          </p>
          {walletsQuery.isLoading ? (
            <Skeleton className="mt-3 h-9 w-40" />
          ) : (
            <p className="num mt-3 text-3xl font-semibold">{formatUsd(total)}</p>
          )}
          {hasChangeData && (
            <p
              className={cn(
                "num mt-2 text-sm",
                change24h >= 0 ? "text-success" : "text-destructive",
              )}
            >
              {t("change24h", { percent: formatPercent(change24h) })}
            </p>
          )}
          {pricesUpdatedAt && (
            <p className="mt-2 text-xs text-muted-foreground">
              {t("pricesAsOf", { time: dateFormat.format(pricesUpdatedAt) })}
            </p>
          )}
        </div>

        <div className="surface-panel p-6 sm:col-span-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {t("allocation")}
          </p>
          {walletsQuery.isLoading ? (
            <Skeleton className="mt-4 h-40 w-full" />
          ) : holdings.length === 0 ? (
            <div className="mt-6 text-sm text-muted-foreground">
              {t.rich("noHoldings", {
                link: (chunks) => (
                  <Link href="/dashboard/wallets" className="text-primary hover:opacity-80">
                    {chunks}
                  </Link>
                ),
              })}
            </div>
          ) : (
            <div className="mt-2 flex flex-col items-center gap-6 sm:flex-row">
              <div className="h-40 w-40 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={holdings}
                      dataKey="usd"
                      nameKey="code"
                      innerRadius={45}
                      outerRadius={70}
                      strokeWidth={0}
                    >
                      {holdings.map((h, index) => (
                        <Cell key={h.code} fill={`var(--chart-${(index % 7) + 1})`} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number, name) => [formatUsd(value), String(name)]}
                      contentStyle={{
                        background: "var(--popover)",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="w-full space-y-2">
                {holdings.map((h, index) => (
                  <li key={h.code} className="flex items-center gap-3 text-sm">
                    <span
                      aria-hidden
                      className="size-2.5 rounded-full"
                      style={{ background: `var(--chart-${(index % 7) + 1})` }}
                    />
                    <span className="num w-12 font-medium">{h.code}</span>
                    <span className="num flex-1 text-muted-foreground">
                      {formatCrypto(h.code, h.amount)}
                    </span>
                    <span className="num">{formatUsd(h.usd)}</span>
                    <span className="num w-14 text-end text-xs text-muted-foreground">
                      {total > 0 ? `${((h.usd / total) * 100).toFixed(1)}%` : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <section aria-labelledby="activity-heading" className="surface-panel p-6">
        <div className="flex items-center justify-between">
          <h2 id="activity-heading" className="text-lg font-semibold">
            {t("recentActivity")}
          </h2>
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard/transactions">{t("viewAll")}</Link>
          </Button>
        </div>

        {txQuery.isLoading ? (
          <div className="mt-5 space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (txQuery.data ?? []).length === 0 ? (
          <p className="mt-5 text-sm text-muted-foreground">{t("noActivity")}</p>
        ) : (
          <ul className="mt-5 divide-y divide-border">
            {(txQuery.data ?? []).slice(0, 6).map((tx) => (
              <li key={tx.id} className="flex items-center justify-between gap-4 py-3">
                <div>
                  <p className="text-sm font-medium">{tc(`transactionTypes.${tx.type}`)}</p>
                  <p className="num mt-0.5 text-xs text-muted-foreground">
                    {dateFormat.format(new Date(tx.created_at))}
                  </p>
                </div>
                <div className="text-end">
                  <p className="num text-sm">
                    {Number(tx.amount) < 0 ? "" : "+"}
                    {formatCrypto(tx.currency, Number(tx.amount))} {tx.currency}
                  </p>
                  <Badge
                    variant={
                      tx.status === "completed"
                        ? "secondary"
                        : tx.status === "pending"
                          ? "outline"
                          : "destructive"
                    }
                    className="mt-1"
                  >
                    {tc(`statuses.${tx.status}`)}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
