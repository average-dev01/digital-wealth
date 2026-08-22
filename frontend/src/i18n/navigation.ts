import { createNavigation } from "next-intl/navigation";

import { routing } from "./routing";

/**
 * Locale-aware replacements for next/link and next/navigation. Importing these
 * instead of the Next.js originals means `<Link href="/dashboard">` resolves to
 * `/ar/dashboard` for an Arabic visitor automatically — no locale plumbing at
 * the call site.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
