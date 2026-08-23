import "dotenv/config";
import { beforeEach } from "vitest";

import { CURRENCY_FIXTURES } from "./currencyFixtures";
import { testDatabaseUrl } from "./testDbUrl";

// Must happen before anything imports lib/prisma.ts (which constructs the
// PrismaClient at module-load time)  the dynamic imports inside beforeEach
// below, rather than top-level ones, are what make that ordering hold
// without forcing this file into ESM (this project targets CommonJS).
process.env.DATABASE_URL = testDatabaseUrl();

beforeEach(async () => {
  const { prisma } = await import("../lib/prisma");
  const { invalidateCurrencyCache } = await import("../lib/currencies");

  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "password_reset_tokens", "refresh_tokens", "kyc_documents",
      "transactions", "wallets", "user_roles", "users",
      "wallet_addresses", "currencies", "contact_submissions"
    RESTART IDENTITY CASCADE
  `);

  // The catalogue is admin-created data now, so wallet provisioning depends on
  // it  without these fixtures, signup would create a user with no wallets.
  const base = Date.now() - CURRENCY_FIXTURES.length * 1000;
  for (const [index, meta] of CURRENCY_FIXTURES.entries()) {
    const currency = await prisma.currency.create({
      data: {
        symbol: meta.symbol,
        name: meta.name,
        decimals: meta.decimals,
        icon: meta.icon,
        mockPriceUsd: meta.mockPriceUsd,
        createdAt: new Date(base + index * 1000),
      },
    });
    await prisma.walletAddress.create({
      data: {
        currencyId: currency.id,
        address: `test-${meta.symbol.toLowerCase()}-deposit-address`,
        network: meta.network,
      },
    });
  }

  // Rows above are brand new every test; the cache would otherwise still hold
  // the previous test's (now deleted) catalogue.
  invalidateCurrencyCache();
});
