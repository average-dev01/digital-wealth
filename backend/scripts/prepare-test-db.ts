/**
 * Runs before the test suite: syncs the Prisma schema onto a `digital_wealth_test`
 * database in the same Postgres container `make db-up` already starts (Prisma's
 * `db push` creates the database if it doesn't exist yet). No migration history is
 * kept here  this DB only ever mirrors the current schema for tests.
 */
import "dotenv/config";
import { execSync } from "node:child_process";

import { testDatabaseUrl } from "../src/__tests__/testDbUrl";

execSync("npx prisma db push --skip-generate --accept-data-loss", {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: testDatabaseUrl() },
});
