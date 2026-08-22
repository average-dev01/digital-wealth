import { defineRouting } from "next-intl/routing";

/**
 * The locales the customer-facing app ships in. The admin panel is English
 * only — it still lives under a locale segment for routing consistency, but
 * its copy is deliberately not translated (see docs/LANGUAGE_PLAN.md).
 */
export const locales = ["en", "ar", "fr", "es"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

/** Right-to-left locales. Drives `dir` on <html> and the logical-property styles. */
const RTL_LOCALES = new Set<string>(["ar"]);

export function isRtl(locale: string): boolean {
  return RTL_LOCALES.has(locale);
}

/** Shown in the language switcher, each in its own language. */
export const localeNames: Record<Locale, string> = {
  en: "English",
  ar: "العربية",
  fr: "Français",
  es: "Español",
};

export const routing = defineRouting({
  locales,
  defaultLocale,
  // Always prefix, including English: /en/about rather than /about. Keeps every
  // URL unambiguous and every locale statically prerenderable.
  localePrefix: "always",
});
