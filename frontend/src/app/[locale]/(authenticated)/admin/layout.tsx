"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";

import { useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Coins,
  Wallet,
  Users,
  ArrowDownToLine,
  ArrowUpFromLine,
  LogOut,
} from "lucide-react";
import { logout } from "@/lib/api/auth";
import { Logo } from "@/components/site/Logo";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth, useIsAdmin } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Link, usePathname, useRouter } from "@/i18n/navigation";

const NAV = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/admin/currencies", label: "Currencies", icon: Coins, exact: false },
  { to: "/admin/wallet-addresses", label: "Wallet addresses", icon: Wallet, exact: false },
  { to: "/admin/users", label: "Users", icon: Users, exact: false },
  { to: "/admin/deposits", label: "Deposits", icon: ArrowDownToLine, exact: false },
  { to: "/admin/withdrawals", label: "Withdrawals", icon: ArrowUpFromLine, exact: false },
] as const;

/**
 * Route-level admin gate for /admin/*.
 *
 * Two redirects, deliberately distinct: signed-out visitors go to the login
 * screen, signed-in non-admins go to their own dashboard (redirect rather than
 * 404, applied consistently across every /admin route). The parent
 * (authenticated) layout already bounces anonymous users; this repeats the
 * check so the guard does not depend on that layout staying in place.
 *
 * The role is read from the profile record via `useIsAdmin()`, not from a nav
 * flag or the cached session, so hiding the link is never what enforces access.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { user, loading } = useAuth();
  const isAdminQuery = useIsAdmin();

  const checking = loading || (Boolean(user) && isAdminQuery.isPending);
  const isAdmin = isAdminQuery.data === true;

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/auth?mode=login");
      return;
    }
    if (!isAdminQuery.isPending && !isAdmin) {
      router.replace("/dashboard");
    }
  }, [user, loading, isAdmin, isAdminQuery.isPending, router]);

  async function handleSignOut() {
    await queryClient.cancelQueries();
    await logout();
    // Full page load, not router.replace()  see dashboard/layout.tsx's
    // handleSignOut for why a client-side navigation bounces back in.
    window.location.replace("/auth?mode=login");
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-background p-8">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }

  // Non-admins never render admin content, even for the frame the redirect takes.
  if (!isAdmin) return <div className="min-h-screen bg-background" />;

  return (
    // The admin panel is deliberately English-only (see docs/LANGUAGE_PLAN.md),
    // so it's pinned to LTR  otherwise an admin browsing the site in Arabic
    // would get an English panel laid out right-to-left.
    <div dir="ltr" className="flex min-h-screen flex-col lg:flex-row">
      <aside className="border-b border-sidebar-border bg-sidebar lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-e">
        <div className="flex items-center justify-between px-4 py-5 lg:px-5">
          <Logo />
        </div>
        <p className="px-4 pb-3 text-xs uppercase tracking-wider text-muted-foreground lg:px-5">
          Administration
        </p>
        <nav
          aria-label="Admin"
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
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="hidden space-y-1 px-3 lg:block">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={handleSignOut}
          >
            <LogOut className="me-2 size-4" aria-hidden /> Sign out
          </Button>
        </div>
      </aside>

      <div className="flex-1">
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">{children}</main>
        <div className="flex gap-2 px-4 pb-8 lg:hidden">
          <Button variant="outline" size="sm" onClick={handleSignOut}>
            <LogOut className="me-2 size-4" aria-hidden /> Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
