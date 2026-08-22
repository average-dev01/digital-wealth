import type { NextFunction, Request, Response } from "express";

import { prisma } from "../lib/prisma";

/**
 * The mirror of `requireAdmin`: keeps desk staff out of the customer-facing
 * endpoints. Must run after `requireAuth`, which sets req.userId.
 *
 * The two account types are mutually exclusive by construction — `seedNewUser`
 * grants only `user`, `prisma/seed.ts` grants only `admin`, and there is no
 * self-serve way to gain a role — but nothing used to *enforce* that at the
 * boundary. An administrator could call `/wallets` or `/kyc` and be silently
 * provisioned a customer wallet, giving a single account both identities and
 * putting desk-held balances into the same tables as customer money.
 *
 * 403 rather than an empty result, so the separation is explicit rather than
 * something a caller has to infer from a blank response.
 */
export async function requireCustomer(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const membership = await prisma.userRole.findFirst({
    where: { userId: req.userId!, role: "admin" },
  });

  if (membership) {
    res.status(403).json({ error: "Desk administrators do not hold customer accounts" });
    return;
  }

  next();
}
