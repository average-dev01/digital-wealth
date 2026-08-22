import { Router } from "express";
import { z } from "zod";

import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/requireAuth";
import { requireCustomer } from "../middleware/requireCustomer";

/**
 * The account keyword: an opaque identifier (12 or 24 words) the customer is
 * issued out-of-band through a separate service and enters here once, so the
 * desk can match them to their issued identifier.
 *
 * It is NOT a credential and NOT a wallet recovery phrase — auth stays email +
 * password, and the keyword grants no access and controls no funds. Word count
 * is not enforced: the UI indicates 12/24, but any non-empty value is accepted.
 */
export const accountKeywordRouter = Router();
// Customers only: desk admins hold no keyword.
accountKeywordRouter.use(requireAuth, requireCustomer);

const submitSchema = z.object({
  // Collapse all runs of whitespace to single spaces so the stored value — and
  // the word count shown against it — is stable regardless of how it was
  // pasted (newlines, double spaces, tabs).
  keyword: z
    .string()
    .transform((value) => value.replace(/\s+/g, " ").trim())
    .pipe(z.string().min(1, "Enter your account keyword").max(600)),
});

accountKeywordRouter.post("/", async (req, res) => {
  const parsed = submitSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid keyword" });
    return;
  }

  const userId = req.userId!;
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { accountKeyword: true },
  });

  // One-time: once set, the customer can't overwrite it. An admin can reset it
  // (POST /admin/users/:id/reset-keyword) if it was entered wrong.
  if (existing?.accountKeyword) {
    res.status(409).json({ error: "Your account keyword is already set" });
    return;
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { accountKeyword: parsed.data.keyword, accountKeywordSetAt: new Date() },
    select: { accountKeyword: true, accountKeywordSetAt: true },
  });

  res.status(201).json(user);
});
