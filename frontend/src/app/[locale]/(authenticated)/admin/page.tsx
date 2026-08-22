"use client";

import { useQuery } from "@tanstack/react-query";
import { Users, Landmark, BadgeCheck, Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { getDashboardStats } from "@/lib/api/adminDashboard";
import { formatUsd } from "@/lib/market";
import { Link } from "@/i18n/navigation";

export default function AdminOverview() {
  const query = useQuery({ queryKey: ["admin", "stats"], queryFn: getDashboardStats });

  const stats = query.data;
  const cards = [
    {
      label: "Total users",
      value: stats ? String(stats.totalUsers) : null,
      hint: "Customer accounts",
      icon: Users,
      href: "/admin/users",
    },
    {
      label: "Simulated AUM",
      value: stats ? formatUsd(stats.totalAumUsd) : null,
      hint: "All wallets at mock prices",
      icon: Landmark,
      href: null,
    },
    {
      label: "Pending KYC",
      value: stats ? String(stats.pendingKyc) : null,
      hint: "Awaiting a decision",
      icon: BadgeCheck,
      href: "/admin/users?kyc=pending",
    },
    {
      label: "Pending transactions",
      value: stats ? String(stats.pendingTransactions) : null,
      hint: "Deposits and withdrawals",
      icon: Clock,
      href: "/admin/deposits",
    },
  ] as const;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Administration</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Desk overview. Every figure below is simulated demonstration data.
        </p>
      </header>

      {query.isError ? (
        <p className="surface-panel p-8 text-center text-sm text-destructive">
          Could not load dashboard statistics.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((card) => {
            const body = (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">{card.label}</p>
                  <card.icon className="size-4 text-primary" aria-hidden />
                </div>
                {card.value === null ? (
                  <Skeleton className="mt-5 h-7 w-24" />
                ) : (
                  <p className="num mt-5 text-2xl font-semibold">{card.value}</p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">{card.hint}</p>
              </>
            );

            return card.href ? (
              <Link
                key={card.label}
                href={card.href}
                className="surface-panel p-5 transition-colors hover:border-primary/40"
              >
                {body}
              </Link>
            ) : (
              <article key={card.label} className="surface-panel p-5">
                {body}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
