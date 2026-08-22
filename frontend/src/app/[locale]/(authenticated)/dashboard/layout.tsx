"use client";

import { useEffect, type ReactNode } from "react";

import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  LayoutDashboard,
  Wallet,
  ListOrdered,
  BadgeCheck,
  Settings,
  KeyRound,
  LogOut,
  ShieldAlert,
} from "lucide-react";
import { logout } from "@/lib/api/auth";
import { Logo } from "@/components/site/Logo";
import { Button } from "@/components/ui/button";
import { useAuth, useIsAdmin, useProfile } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Link, usePathname, useRouter } from "@/i18n/navigation";

/** Keys only — the labels come from messages/*.json under `dashboard.nav`. */
const NAV = [
  { to: "/dashboard", key: "overview", icon: LayoutDashboard, exact: true },
  { to: "/dashboard/wallets", key: "wallets", icon: Wallet, exact: false },
  { to: "/dashboard/transactions", key: "transactions", icon: ListOrdered, exact: false },
  { to: "/dashboard/kyc", key: "kyc", icon: BadgeCheck, exact: false },
  { to: "/dashboard/account-keyword", key: "accountKeyword", icon: KeyRound, exact: false },
  { to: "/dashboard/settings", key: "settings", icon: Settings, exact: false },
] as const;

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const t = useTranslations("dashboard");
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: profile } = useProfile();
  const { user, loading } = useAuth();
  const isAdminQuery = useIsAdmin();

  const isAdmin = isAdminQuery.data === true;
  const checking = loading || (Boolean(user) && isAdminQuery.isPending);

  // The mirror of the /admin gate. Desk staff hold no wallets, no balances and
  // no KYC record, so the customer dashboard is not a view they have a version
  // of — it would render an empty portfolio and, before the backend guard, a
  // request here would have provisioned them one. The role comes from
  // GET /auth/me, never a client-held flag.
  useEffect(() => {
    if (checking) return;
    if (isAdmin) router.replace("/admin");
  }, [checking, isAdmin, router]);

  async function handleSignOut() {
    await queryClient.cancelQueries();
    await logout();
    // Full page load rather than router.replace(). A client-side navigation
    // keeps AuthProvider mounted, and evicting the cache does NOT update an
    // already-mounted observer — so the auth page would mount still reading
    // the old logged-in user from context and its "already signed in" effect
    // would bounce straight back to /dashboard. Reloading tears down all
    // in-memory state, which is also what we want on logout: nothing of the
    // previous user's data survives in the tab.
    window.location.replace("/auth?mode=login");
  }

  // Admins never render customer content, even for the frame the redirect takes.
  if (checking || isAdmin) {
    return <div className="min-h-screen bg-background" />;
  }

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="border-b border-sidebar-border bg-sidebar lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-e">
        <div className="flex items-center justify-between px-4 py-5 lg:px-5">
          <Logo />
        </div>
        <nav
          aria-label={t("navLabel")}
          className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:pb-5"
        >
          {NAV.map((item) => {
            const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                href={item.to}
                className={cn(
                  "flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground",
                  active && "bg-sidebar-accent text-primary",
                )}
              >
                <item.icon className="size-4" aria-hidden />
                {t(`nav.${item.key}`)}
              </Link>
            );
          })}
        </nav>
        <div className="hidden px-3 lg:block">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={handleSignOut}
          >
            <LogOut className="me-2 size-4" aria-hidden /> {t("signOut")}
          </Button>
        </div>
      </aside>

      <div className="flex-1">
        {profile && profile.kyc_status !== "verified" && (
          <div className="flex items-start gap-3 border-b border-warning/30 bg-warning/10 px-4 py-3 text-sm sm:px-8">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <p className="text-muted-foreground">
              {profile.kyc_status === "rejected" ? t("kycRejected") : t("kycPending")}{" "}
              <Link href="/dashboard/kyc" className="text-primary hover:opacity-80">
                {t("goToVerification")}
              </Link>
            </p>
          </div>
        )}
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">{children}</main>
        <div className="px-4 pb-8 lg:hidden">
          <Button variant="outline" size="sm" onClick={handleSignOut}>
            <LogOut className="me-2 size-4" aria-hidden /> {t("signOut")}
          </Button>
        </div>
      </div>
    </div>
  );
}
