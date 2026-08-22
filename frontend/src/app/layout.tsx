import type { ReactNode } from "react";

import "./globals.css";

/**
 * Root shell. Deliberately minimal: `<html lang>` and `dir` depend on the
 * active locale, which only `app/[locale]/layout.tsx` knows, so this passes
 * children straight through and lets that layout own the document attributes.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
