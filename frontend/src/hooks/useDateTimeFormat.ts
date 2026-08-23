"use client";

import { useMemo } from "react";
import { useLocale } from "next-intl";

/**
 * Locale-aware timestamp formatting for transaction rows, replacing the
 * hardcoded `date-fns` "d MMM yyyy, HH:mm" pattern  month names were the one
 * piece of visible English left on a translated dashboard.
 *
 * The `-u-nu-latn` extension pins Western digits in every locale, Arabic
 * included: the design system keeps all figures in Latin numerals (see the
 * `num` utility used for balances), so dates match the amounts beside them.
 */
export function useDateTimeFormat(): Intl.DateTimeFormat {
  const locale = useLocale();

  return useMemo(
    () =>
      new Intl.DateTimeFormat(`${locale}-u-nu-latn`, {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
    [locale],
  );
}
