import path from "node:path";
import { fileURLToPath } from "node:url";
import createNextIntlPlugin from "next-intl/plugin";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: path.join(__dirname, ".."),
  // Docker image ships only the traced server bundle, not full node_modules.
  output: "standalone",
  // Proxies every browser-facing API call through the frontend's own origin
  // instead of the backend's. Railway's generated `*.up.railway.app` domains
  // are on the Public Suffix List (each subdomain is its own "site" to the
  // browser), so a directly cross-origin frontend->backend call can never
  // carry the httpOnly session cookies (sameSite: "strict") or let client JS
  // read the CSRF cookie (document.cookie is origin-scoped)  see
  // docs/RAILWAY_DEPLOY.md. Routing through this rewrite makes every request
  // same-origin from the browser's point of view, which both mechanisms need.
  // middleware.ts's matcher already excludes `/api` from locale redirection
  // for exactly this reason. `NEXT_PUBLIC_API_URL` is read at build time
  // (same requirement as before, already wired through frontend/Dockerfile).
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL}/:path*`,
      },
    ];
  },
  images: {
    // Asset logos served by the market data provider. Currency icons are
    // stored as absolute URLs on the Currency row, so the host has to be
    // allow-listed here or next/image refuses to optimise them.
    remotePatterns: [
      { protocol: "https", hostname: "static.coinpaprika.com" },
      // Ready for the CoinGecko provider  see backend/src/lib/priceProviders.
      { protocol: "https", hostname: "assets.coingecko.com" },
      { protocol: "https", hostname: "coin-images.coingecko.com" },
    ],
  },
};

export default withNextIntl(nextConfig);
