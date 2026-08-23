import { Router } from "express";
import { z } from "zod";

import { prisma } from "../lib/prisma";
import { settleTransaction } from "../lib/walletService";
import { requireAdmin } from "../middleware/requireAdmin";
import { requireAuth } from "../middleware/requireAuth";

export const adminTransactionsRouter = Router();
adminTransactionsRouter.use(requireAuth, requireAdmin);

const pendingQuerySchema = z.object({ type: z.enum(["deposit", "withdrawal"]) });

adminTransactionsRouter.get("/pending", async (req, res) => {
  const parsed = pendingQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose deposit or withdrawal" });
    return;
  }

  // Joined in one query  the customer column would otherwise be a lookup per row.
  const transactions = await prisma.transaction.findMany({
    where: { type: parsed.data.type, status: "pending" },
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { id: true, email: true, fullName: true, kycStatus: true } },
    },
  });

  res.json({ transactions });
});

const reviewSchema = z.object({
  status: z.enum(["completed", "rejected"]),
  note: z.string().trim().max(300).optional(),
});

adminTransactionsRouter.post("/:id/review", async (req, res) => {
  const parsed = reviewSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid decision" });
    return;
  }

  try {
    const transaction = await settleTransaction(
      req.params["id"]!,
      parsed.data.status,
      parsed.data.note,
    );
    res.json({ transaction });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not review this request";
    res.status(message === "Transaction not found" ? 404 : 400).json({ error: message });
  }
});
