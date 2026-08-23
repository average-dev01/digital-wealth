import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";

import { routing } from "./routing";

/**
 * Loads the message catalogue for the active request.
 *
 * Messages are plain JSON generated ahead of time (see scripts/translate.ts) —
 * nothing calls a translation service at runtime. A key missing from a locale
 * falls back to English rather than rendering blank, so a partially translated
 * file is always safe to ship.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  const [messages, fallback] = await Promise.all([
    import(`../../messages/${locale}.json`).then((m) => m.default),
    locale === routing.defaultLocale
      ? Promise.resolve(null)
      : import(`../../messages/${routing.defaultLocale}.json`).then((m) => m.default),
  ]);

  return {
    locale,
    messages: fallback ? deepMerge(fallback, messages) : messages,
  };
});

/** English underneath, the target locale on top  so any untranslated key still renders. */
function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const existing = out[key];
    out[key] =
      isPlainObject(existing) && isPlainObject(value)
        ? deepMerge(existing, value)
        : (value ?? existing);
  }
  return out;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
