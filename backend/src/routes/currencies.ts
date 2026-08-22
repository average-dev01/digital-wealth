import { Router } from "express";

import { prisma } from "../lib/prisma";

/**
 * Public, read-only view of the currency catalogue — the display metadata the
 * customer app needs to render a wallet (name, glyph, decimals, price)
 * without admin permissions. `/admin/currencies` remains the write surface.
 *
 * Prices here are real: `live` currencies are refreshed from the market data
 * provider by `lib/priceFeed.ts`. `priceUpdatedAt` lets the client show how
 * fresh a figure is rather than implying it is to-the-second.
 *
 * Inactive currencies are included: a customer can still hold a balance in an
 * asset the desk has since delisted, and that card needs its real name and
 * price to render, with deposits disabled rather than the wallet vanishing.
 */
export const currenciesRouter = Router();

currenciesRouter.get("/", async (_req, res) => {
  const currencies = await prisma.currency.findMany({
    orderBy: [{ createdAt: "asc" }, { symbol: "asc" }],
    select: {
      id: true,
      symbol: true,
      name: true,
      icon: true,
      iconUrl: true,
      decimals: true,
      mockPriceUsd: true,
      priceSource: true,
      priceChange24h: true,
      priceUpdatedAt: true,
      isActive: true,
    },
  });

  res.json({ currencies });
});
