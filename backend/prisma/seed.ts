/**
 * Creates the one account that can't be created through the app: an
 * administrator. There is no self-serve way to grant the admin role, so
 * without this there'd be no way into the admin panel on a fresh database.
 *
 * Nothing else is seeded — no demo customers, no currencies, no deposit
 * addresses, no balances. The catalogue is built by signing in as this admin
 * and creating currencies and addresses for real, and every customer,
 * balance and transaction comes from actual use of the app.
 *
 * Idempotent — safe to re-run.
 */
import "dotenv/config";

import { hashPassword } from "../src/lib/password";
import { prisma } from "../src/lib/prisma";

export const DEMO_ADMIN_EMAIL = "admin@digitalwealth.example";
const DEMO_ADMIN_PASSWORD = "admin1234";

async function main(): Promise<void> {
  const existing = await prisma.user.findUnique({
    where: { email: DEMO_ADMIN_EMAIL },
    include: { roles: true },
  });

  if (existing) {
    // Re-grant the role if it's somehow missing, so a half-seeded database
    // repairs itself instead of locking everyone out of the admin panel.
    if (!existing.roles.some((r) => r.role === "admin")) {
      await prisma.userRole.create({ data: { userId: existing.id, role: "admin" } });
      console.log(`[seed] restored admin role for ${DEMO_ADMIN_EMAIL}`);
    } else {
      console.log(`[seed] administrator already present (${DEMO_ADMIN_EMAIL})`);
    }
    return;
  }

  const admin = await prisma.user.create({
    data: {
      email: DEMO_ADMIN_EMAIL,
      passwordHash: await hashPassword(DEMO_ADMIN_PASSWORD),
      fullName: "Desk Administrator",
      country: "GB",
      kycStatus: "verified",
    },
  });
  await prisma.userRole.create({ data: { userId: admin.id, role: "admin" } });

  console.log(`[seed] administrator created: ${DEMO_ADMIN_EMAIL} / ${DEMO_ADMIN_PASSWORD}`);
  console.log("[seed] no currencies seeded — add them in the admin panel to get started.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error("[seed] failed", error);
    await prisma.$disconnect();
    process.exit(1);
  });
