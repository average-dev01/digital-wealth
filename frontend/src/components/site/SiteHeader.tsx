"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "./Logo";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { Link, usePathname } from "@/i18n/navigation";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

/** Paths are locale-agnostic  the Link from i18n/navigation adds the prefix. */
const NAV = [
  { to: "/", key: "home" },
  { to: "/about", key: "about" },
  { to: "/services", key: "services" },
  { to: "/security", key: "security" },
  { to: "/contact", key: "contact" },
] as const;

export function SiteHeader() {
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);
  const { user } = useAuth();

  // Desk staff have no portfolio  sending them to /dashboard would just bounce
  // off that route's guard. Same role check the auth page uses after login.
  const isAdmin = user?.role === "ADMIN";
  const homeHref = isAdmin ? "/admin" : "/dashboard";
  const homeLabelKey = isAdmin ? "adminPanel" : "myPortfolio";
  const pathname = usePathname();

  function isActive(to: string) {
    return to === "/" ? pathname === "/" : pathname.startsWith(to);
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-4 sm:px-6">
        <Logo />

        <nav aria-label={t("mainLabel")} className="hidden items-center gap-1 lg:flex">
          {NAV.map((item) => (
            <Link
              key={item.to}
              href={item.to}
              className={cn(
                "rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground",
                isActive(item.to) && "text-primary",
              )}
            >
              {t(item.key)}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <LanguageSwitcher />
          {user ? (
            <Button asChild size="sm">
              <Link href={homeHref}>{t(homeLabelKey)}</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/auth?mode=login">{t("logIn")}</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/auth?mode=signup">{t("openAccount")}</Link>
              </Button>
            </>
          )}
        </div>

        <div className="flex items-center gap-1 lg:hidden">
          <LanguageSwitcher />
          <Button
            variant="ghost"
            size="icon"
            aria-label={open ? t("closeMenu") : t("openMenu")}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
        </div>
      </div>

      {open && (
        <div className="border-t border-border/70 bg-background lg:hidden">
          <nav aria-label="Mobile" className="mx-auto flex max-w-6xl flex-col px-4 py-3 sm:px-6">
            {NAV.map((item) => (
              <Link
                key={item.to}
                href={item.to}
                onClick={() => setOpen(false)}
                className={cn(
                  "rounded-md px-2 py-3 text-sm text-muted-foreground",
                  isActive(item.to) && "text-primary",
                )}
              >
                {t(item.key)}
              </Link>
            ))}
            <div className="mt-3 flex flex-col gap-2 border-t border-border/70 pt-3">
              {user ? (
                <Button asChild onClick={() => setOpen(false)}>
                  <Link href={homeHref}>{t(homeLabelKey)}</Link>
                </Button>
              ) : (
                <>
                  <Button asChild variant="outline" onClick={() => setOpen(false)}>
                    <Link href="/auth?mode=login">{t("logIn")}</Link>
                  </Button>
                  <Button asChild onClick={() => setOpen(false)}>
                    <Link href="/auth?mode=signup">{t("openAccount")}</Link>
                  </Button>
                </>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
