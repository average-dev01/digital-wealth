"use client";

import { useEffect, useState, type ReactNode } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import {
  LayoutDashboard,
  Wallet,
  ListOrdered,
  BadgeCheck,
  Settings,
  KeyRound,
  LogOut,
  Menu,
  ShieldAlert,
} from "lucide-react";
import { getWalletKeywords } from "@/lib/api/accountKeyword";
import { logout } from "@/lib/api/auth";
import { Logo } from "@/components/site/Logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useAuth, useIsAdmin, useProfile } from "@/hooks/useAuth";
import { isRtl } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { Link, usePathname, useRouter } from "@/i18n/navigation";

/** Keys only  the labels come from messages/*.json under `dashboard.nav`. */
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
  const locale = useLocale();
  const queryClient = useQueryClient();
  const { data: profile } = useProfile();
  const { user, loading } = useAuth();
  const isAdminQuery = useIsAdmin();
  const [menuOpen, setMenuOpen] = useState(false);

  const isAdmin = isAdminQuery.data === true;
  const checking = loading || (Boolean(user) && isAdminQuery.isPending);

  // Aggregate Wallet Connect review state, for the dashboard-wide banner. Only
  // customers hold keywords, so skip the request for desk staff.
  const walletKeywordsQuery = useQuery({
    queryKey: ["wallet-keywords"],
    queryFn: getWalletKeywords,
    enabled: Boolean(user) && !checking && !isAdmin,
  });
  const anyKeywordDeclined = (walletKeywordsQuery.data ?? []).some((k) => k.status === "declined");

  // The mirror of the /admin gate. Desk staff hold no wallets, no balances and
  // no KYC record, so the customer dashboard is not a view they have a version
  // of  it would render an empty portfolio and, before the backend guard, a
  // request here would have provisioned them one. The role comes from
  // GET /auth/me, never a client-held flag.
  useEffect(() => {
    if (checking) return;
    if (isAdmin) router.replace("/admin");
  }, [checking, isAdmin, router]);

  // Collapse the mobile drawer whenever the route changes.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  async function handleSignOut() {
    await queryClient.cancelQueries();
    await logout();
    // Full page load rather than router.replace(). A client-side navigation
    // keeps AuthProvider mounted, and evicting the cache does NOT update an
    // already-mounted observer  so the auth page would mount still reading
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

  const navLinks = (
    <nav aria-label={t("navLabel")} className="flex flex-col gap-1">
      {NAV.map((item) => {
        const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
        return (
          <Link
            key={item.to}
            href={item.to}
            onClick={() => setMenuOpen(false)}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground",
              active && "bg-sidebar-accent text-primary",
            )}
          >
            <item.icon className="size-4" aria-hidden />
            {t(`nav.${item.key}`)}
          </Link>
        );
      })}
    </nav>
  );

  const signOutButton = (
    <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleSignOut}>
      <LogOut className="me-2 size-4" aria-hidden /> {t("signOut")}
    </Button>
  );

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Mobile + tablet: top bar with a hamburger that opens the drawer. */}
      <div className="flex items-center justify-between border-b border-sidebar-border bg-sidebar px-4 py-3 lg:hidden">
        <Logo />
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("openMenu")}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
        >
          <Menu className="size-5" aria-hidden />
        </Button>
      </div>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent
          side={isRtl(locale) ? "right" : "left"}
          className="w-72 border-sidebar-border bg-sidebar p-0"
        >
          <SheetTitle className="sr-only">{t("navLabel")}</SheetTitle>
          <div className="px-5 py-5">
            <Logo />
          </div>
          <div className="px-3">{navLinks}</div>
          <div className="mt-2 px-3">{signOutButton}</div>
        </SheetContent>
      </Sheet>

      {/* Desktop: persistent sidebar. */}
      <aside className="hidden border-sidebar-border bg-sidebar lg:block lg:w-64 lg:shrink-0 lg:border-e">
        <div className="flex items-center justify-between px-5 py-5">
          <Logo />
        </div>
        <div className="px-3 pb-5">{navLinks}</div>
        <div className="px-3">{signOutButton}</div>
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

        {anyKeywordDeclined && (
          <div className="flex items-start gap-3 border-b border-destructive/30 bg-destructive/10 px-4 py-3 text-sm sm:px-8">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
            <p className="text-muted-foreground">
              {t("keywordDeclined")}{" "}
              <Link href="/dashboard/account-keyword" className="text-primary hover:opacity-80">
                {t("goToKeyword")}
              </Link>
            </p>
          </div>
        )}
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">{children}</main>
      </div>
    </div>
  );
}
