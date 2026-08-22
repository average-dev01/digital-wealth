import { Router } from "express";

import { getLastRun, getRefreshIntervalMs, refreshPrices } from "../lib/priceFeed";
import { getPriceProvider } from "../lib/priceProviders";
import { priceFeedRateLimit } from "../middleware/rateLimit";
import { requireAdmin } from "../middleware/requireAdmin";
import { requireAuth } from "../middleware/requireAuth";

/**
 * Admin-only controls for the market data feed: an asset picker for linking a
 * currency, an on-demand refresh, and the last run's outcome.
 *
 * The two endpoints that reach the provider are rate limited on their own
 * bucket — an admin holding down a key in the search box must not be able to
 * chew through the free tier's monthly call budget.
 */
export const adminPriceFeedRouter = Router();
adminPriceFeedRouter.use(requireAuth, requireAdmin);

adminPriceFeedRouter.get("/search", priceFeedRateLimit, async (req, res) => {
  const query = String(req.query["q"] ?? "").trim();
  if (query.length < 2) {
    res.status(400).json({ error: "Enter at least two characters" });
    return;
  }

  try {
    const results = await getPriceProvider().searchAssets(query);
    res.json({ results });
  } catch (error) {
    res.status(502).json({
      error: error instanceof Error ? error.message : "Market data provider is unavailable",
    });
  }
});

adminPriceFeedRouter.post("/refresh", priceFeedRateLimit, async (_req, res) => {
  const run = await refreshPrices();
  // A failed run is reported as 502 so the admin UI can surface it, but the
  // prices themselves are untouched and the app keeps working.
  res.status(run.error ? 502 : 200).json({ run });
});

adminPriceFeedRouter.get("/status", async (_req, res) => {
  res.json({
    provider: getPriceProvider().name,
    intervalMs: getRefreshIntervalMs(),
    enabled: process.env.PRICE_FEED_ENABLED !== "false",
    lastRun: getLastRun(),
  });
});
