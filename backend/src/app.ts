import "express-async-errors";

import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";

import { csrfProtection } from "./lib/csrf";
import { prisma } from "./lib/prisma";
import { requestLogger } from "./middleware/requestLogger";
import { accountKeywordRouter } from "./routes/accountKeyword";
import { adminCurrenciesRouter } from "./routes/adminCurrencies";
import { adminDashboardRouter } from "./routes/adminDashboard";
import { adminPriceFeedRouter } from "./routes/adminPriceFeed";
import { adminTransactionsRouter } from "./routes/adminTransactions";
import { adminUsersRouter } from "./routes/adminUsers";
import { adminWalletAddressesRouter } from "./routes/adminWalletAddresses";
import { authRouter } from "./routes/auth";
import { contactRouter } from "./routes/contact";
import { currenciesRouter } from "./routes/currencies";
import { kycRouter } from "./routes/kyc";
import { walletsRouter } from "./routes/wallets";

export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(
    cors({
      origin: process.env.FRONTEND_ORIGIN,
      credentials: true,
    }),
  );
  app.use(compression());
  app.use(cookieParser(process.env.COOKIE_SECRET));
  app.use(express.json());
  app.use(requestLogger);
  app.use(csrfProtection);

  app.get("/health", async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: "ok", dbConnected: true });
    } catch (error) {
      console.error("[health] database check failed", error);
      res.status(503).json({ status: "error", dbConnected: false });
    }
  });

  app.use("/auth", authRouter);
  app.use("/wallets", walletsRouter);
  app.use("/kyc", kycRouter);
  app.use("/account-keyword", accountKeywordRouter);
  app.use("/contact", contactRouter);
  app.use("/currencies", currenciesRouter);
  app.use("/admin/currencies", adminCurrenciesRouter);
  app.use("/admin/wallet-addresses", adminWalletAddressesRouter);
  app.use("/admin/users", adminUsersRouter);
  app.use("/admin/transactions", adminTransactionsRouter);
  app.use("/admin/dashboard", adminDashboardRouter);
  app.use("/admin/price-feed", adminPriceFeedRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // Catches anything a route forgot to try/catch. Express 4 doesn't forward
  // rejected promises from async handlers on its own — without the
  // express-async-errors import above, a thrown error here would just hang
  // the connection instead of reaching this middleware.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error("[error]", err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  });

  return app;
}
