/**
 * Creates (or rotates) the one account that can't be created through the
 * app: an administrator. There is no self-serve way to grant the admin
 * role, so without this there'd be no way into the admin panel on a fresh
 * database.
 *
 * Email/password come from ADMIN_EMAIL / ADMIN_PASSWORD so they can be set
 * per-environment (e.g. Railway service variables) and rotated by changing
 * the variable and re-running this script  falls back to the demo values
 * below when unset, which is what local dev and the test DB use.
 *
 * Nothing else is seeded  no demo customers, no currencies, no deposit
 * addresses, no balances. The catalogue is built by signing in as this admin
 * and creating currencies and addresses for real, and every customer,
 * balance and transaction comes from actual use of the app.
 *
 * Idempotent  safe to re-run. Re-running with a changed ADMIN_PASSWORD
 * rotates the existing account's password; a changed ADMIN_EMAIL creates a
 * *new* admin account rather than renaming the old one (Prisma User rows are
 * keyed by email), so clean up the old row yourself if that's not wanted.
 */
import "dotenv/config";

import { hashPassword } from "../src/lib/password";
import { prisma } from "../src/lib/prisma";

export const DEMO_ADMIN_EMAIL = "admin@digitalwealth.example";
const DEMO_ADMIN_PASSWORD = "admin1234";

const ADMIN_EMAIL = process.env["ADMIN_EMAIL"] ?? DEMO_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env["ADMIN_PASSWORD"] ?? DEMO_ADMIN_PASSWORD;

async function main(): Promise<void> {
  const existing = await prisma.user.findUnique({
    where: { email: ADMIN_EMAIL },
    include: { roles: true },
  });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash: await hashPassword(ADMIN_PASSWORD) },
    });

    // Re-grant the role if it's somehow missing, so a half-seeded database
    // repairs itself instead of locking everyone out of the admin panel.
    if (!existing.roles.some((r) => r.role === "admin")) {
      await prisma.userRole.create({ data: { userId: existing.id, role: "admin" } });
      console.log(`[seed] restored admin role for ${ADMIN_EMAIL}`);
    }
    console.log(`[seed] administrator password rotated for ${ADMIN_EMAIL}`);
    return;
  }

  const admin = await prisma.user.create({
    data: {
      email: ADMIN_EMAIL,
      passwordHash: await hashPassword(ADMIN_PASSWORD),
      fullName: "Desk Administrator",
      country: "GB",
      kycStatus: "verified",
    },
  });
  await prisma.userRole.create({ data: { userId: admin.id, role: "admin" } });

  console.log(`[seed] administrator created: ${ADMIN_EMAIL}`);
  console.log("[seed] no currencies seeded  add them in the admin panel to get started.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error("[seed] failed", error);
    await prisma.$disconnect();
    process.exit(1);
  });
