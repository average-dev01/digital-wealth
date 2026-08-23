import createMiddleware from "next-intl/middleware";

import { routing } from "./i18n/routing";

/**
 * Redirects `/about` to `/en/about` (or the visitor's best `Accept-Language`
 * match) and rewrites locale-prefixed URLs onto the `app/[locale]` tree.
 */
export default createMiddleware(routing);

export const config = {
  // Everything except Next internals, the API proxy and static files  the
  // extension check keeps favicon.png, robots.txt and friends out of the way.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
