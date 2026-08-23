import { Prisma } from "@prisma/client";
import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";

import { prisma } from "../lib/prisma";
import { adminAdjustBalance } from "../lib/walletService";
import { requireAdmin } from "../middleware/requireAdmin";
import { requireAuth } from "../middleware/requireAuth";

export const adminUsersRouter = Router();
adminUsersRouter.use(requireAuth, requireAdmin);

const kycStatusSchema = z.enum(["pending", "verified", "rejected"]);

const listQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  kycStatus: kycStatusSchema.or(z.literal("all")).optional(),
  isActive: z.enum(["true", "false", "all"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});

/** Desk staff are excluded  this list is customers only. */
const CUSTOMERS_ONLY: Prisma.UserWhereInput = {
  NOT: { roles: { some: { role: "admin" } } },
};

/**
 * Every /:id route below addresses a *customer*, so a desk account id is
 * treated as simply absent from that namespace  the same view the list takes.
 *
 * This guards the mutations more than the read: without it one administrator
 * could suspend another, rewrite their KYC decision, or post a balance
 * adjustment that creates a wallet for a desk account, which is exactly the
 * customer/admin blurring the role split exists to prevent.
 */
async function customersOnly(req: Request, res: Response, next: NextFunction): Promise<void> {
  const deskAccount = await prisma.userRole.findFirst({
    where: { userId: req.params["id"]!, role: "admin" },
  });

  if (deskAccount) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }

  next();
}

/** Strips the bcrypt hash before any user row goes over the wire. */
function withoutPasswordHash<T extends { passwordHash: string }>(user: T): Omit<T, "passwordHash"> {
  const { passwordHash: _passwordHash, ...rest } = user;
  return rest;
}

adminUsersRouter.get("/", async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid filters" });
    return;
  }
  const { search, kycStatus, isActive, page, pageSize } = parsed.data;

  const where: Prisma.UserWhereInput = {
    ...CUSTOMERS_ONLY,
    ...(kycStatus && kycStatus !== "all" ? { kycStatus } : {}),
    ...(isActive && isActive !== "all" ? { isActive: isActive === "true" } : {}),
    ...(search
      ? {
          OR: [
            { fullName: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  // Filtering and paging happen in Postgres, not in JS over every row.
  const [total, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  res.json({
    rows,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
});

adminUsersRouter.get("/:id", customersOnly, async (req, res) => {
  // One round trip for the whole detail bundle instead of four.
  const user = await prisma.user.findUnique({
    where: { id: req.params["id"]! },
    include: {
      wallets: { orderBy: { currency: "asc" } },
      transactions: { orderBy: { createdAt: "desc" } },
      kycDocuments: { orderBy: { submittedAt: "desc" } },
      roles: true,
    },
  });
  if (!user) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }

  const { wallets, transactions, kycDocuments, roles, ...profile } = user;
  res.json({
    // Strip the bcrypt hash  the previous `...profile` spread put it on the
    // wire on every admin detail view.
    profile: withoutPasswordHash(profile),
    isAdmin: roles.some((r) => r.role === "admin"),
    wallets,
    transactions,
    kycDocuments,
  });
});

const updateUserSchema = z.object({
  isActive: z.boolean().optional(),
  fullName: z.string().trim().min(2, "Enter the customer's full name").max(120).optional(),
});

adminUsersRouter.patch("/:id", customersOnly, async (req, res) => {
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid update" });
    return;
  }

  try {
    const user = await prisma.user.update({
      where: { id: req.params["id"]! },
      data: parsed.data,
    });
    // Suspension must end the session too, or the customer keeps browsing on
    // their existing cookies until the access token happens to expire.
    if (parsed.data.isActive === false) {
      await prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    res.json({ profile: withoutPasswordHash(user) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      res.status(404).json({ error: "Customer not found" });
      return;
    }
    throw error;
  }
});

adminUsersRouter.patch("/:id/kyc", customersOnly, async (req, res) => {
  const parsed = z.object({ status: kycStatusSchema }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose a valid verification status" });
    return;
  }

  try {
    const user = await prisma.user.update({
      where: { id: req.params["id"]! },
      data: { kycStatus: parsed.data.status },
    });
    // Keep the customer's document rows in step with the account decision.
    await prisma.kycDocument.updateMany({
      where: { userId: user.id },
      data: { status: parsed.data.status },
    });
    res.json({ profile: withoutPasswordHash(user) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      res.status(404).json({ error: "Customer not found" });
      return;
    }
    throw error;
  }
});

const adjustBalanceSchema = z.object({
  currencyId: z.string().min(1, "Select a currency"),
  amount: z.number().refine((v) => v !== 0, "Enter a non-zero amount"),
  note: z.string().trim().min(4, "Add a note explaining this adjustment").max(300),
});

adminUsersRouter.post("/:id/adjust-balance", customersOnly, async (req, res) => {
  const parsed = adjustBalanceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid adjustment" });
    return;
  }

  const userId = req.params["id"]!;
  const [user, currency] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.currency.findUnique({ where: { id: parsed.data.currencyId } }),
  ]);
  if (!user) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }
  if (!currency) {
    res.status(400).json({ error: "Currency not found" });
    return;
  }

  try {
    await adminAdjustBalance(userId, currency.symbol, parsed.data.amount, parsed.data.note);
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Adjustment failed" });
  }
});

/**
 * Clears a customer's account keyword so they can re-enter it. The customer
 * field is one-time and locks after submission, so without this a mistyped
 * keyword would be stuck forever.
 */
adminUsersRouter.post("/:id/reset-keyword", customersOnly, async (req, res) => {
  try {
    await prisma.user.update({
      where: { id: req.params["id"]! },
      data: { accountKeyword: null, accountKeywordSetAt: null },
    });
    res.json({ ok: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      res.status(404).json({ error: "Customer not found" });
      return;
    }
    throw error;
  }
});
