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
  images: {
    // Asset logos served by the market data provider. Currency icons are
    // stored as absolute URLs on the Currency row, so the host has to be
    // allow-listed here or next/image refuses to optimise them.
    remotePatterns: [
      { protocol: "https", hostname: "static.coinpaprika.com" },
      // Ready for the CoinGecko provider — see backend/src/lib/priceProviders.
      { protocol: "https", hostname: "assets.coingecko.com" },
      { protocol: "https", hostname: "coin-images.coingecko.com" },
    ],
  },
};

export default withNextIntl(nextConfig);
