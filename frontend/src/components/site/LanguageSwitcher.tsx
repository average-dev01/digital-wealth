"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { Globe } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePathname, useRouter } from "@/i18n/navigation";
import { locales, localeNames, type Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";

/**
 * Switches locale while staying on the current page — `/en/wallets` becomes
 * `/ar/wallets`, not the homepage. `usePathname` here is the locale-aware one
 * from i18n/navigation, so it returns the path *without* the locale prefix and
 * the router re-adds the new one.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const t = useTranslations("language");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onChange(next: string) {
    // Read the query string here rather than via useSearchParams: that hook
    // would force every page rendering this header out of static prerendering.
    const search = typeof window === "undefined" ? "" : window.location.search;
    startTransition(() => {
      router.replace(`${pathname}${search}`, { locale: next as Locale });
    });
  }

  return (
    <Select value={locale} onValueChange={onChange} disabled={isPending}>
      <SelectTrigger
        aria-label={t("change")}
        className={cn("h-9 w-auto gap-2 border-none bg-transparent px-2", className)}
      >
        <Globe className="size-4 shrink-0" aria-hidden />
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {locales.map((code) => (
          <SelectItem key={code} value={code}>
            {localeNames[code]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
