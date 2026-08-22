import { Router } from "express";

import { prisma } from "../lib/prisma";
import { requireAdmin } from "../middleware/requireAdmin";
import { requireAuth } from "../middleware/requireAuth";

export const adminDashboardRouter = Router();
adminDashboardRouter.use(requireAuth, requireAdmin);

adminDashboardRouter.get("/stats", async (_req, res) => {
  const customersOnly = { NOT: { roles: { some: { role: "admin" as const } } } };

  const [totalUsers, pendingKyc, pendingTransactions, balancesByCurrency, currencies] =
    await Promise.all([
      prisma.user.count({ where: customersOnly }),
      prisma.user.count({ where: { ...customersOnly, kycStatus: "pending" } }),
      prisma.transaction.count({ where: { status: "pending" } }),
      // Summed in Postgres rather than pulling every wallet row into JS.
      prisma.wallet.groupBy({ by: ["currency"], _sum: { balance: true } }),
      prisma.currency.findMany({ select: { symbol: true, mockPriceUsd: true } }),
    ]);

  // Valued against the admin-editable catalogue price, so an edited price is
  // reflected here rather than against the frontend's compile-time list.
  const priceBySymbol = new Map(currencies.map((c) => [c.symbol, Number(c.mockPriceUsd)]));
  const totalAumUsd = balancesByCurrency.reduce((sum, row) => {
    const price = priceBySymbol.get(row.currency) ?? 0;
    return sum + Number(row._sum.balance ?? 0) * price;
  }, 0);

  res.json({ totalUsers, totalAumUsd, pendingKyc, pendingTransactions });
});
