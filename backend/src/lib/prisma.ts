import { PrismaClient } from "@prisma/client";

// Reuse a single PrismaClient across dev hot-reloads (tsx watch) instead of
// opening a new pool of DB connections on every restart.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// PRISMA_LOG_QUERIES=true prints every SQL statement, for spotting N+1s and
// counting round trips per request against the requestLogger's timings.
// Off by default  it's very noisy and logs query text.
const options: ConstructorParameters<typeof PrismaClient>[0] =
  process.env.PRISMA_LOG_QUERIES === "true" ? { log: ["query"] } : {};

export const prisma = globalForPrisma.prisma ?? new PrismaClient(options);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
