import { Router } from "express";
import { z } from "zod";

import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/requireAuth";
import { requireCustomer } from "../middleware/requireCustomer";

export const kycRouter = Router();
// Customers only: KYC is something the desk reviews, not something it files.
kycRouter.use(requireAuth, requireCustomer);

const kycSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full legal name").max(120),
  dob: z.string().min(1, "Enter your date of birth"),
  country: z.string().trim().min(2, "Enter your country of residence").max(80),
  /**
   * SIMULATED upload: only the file's name is recorded. There is no file
   * storage in this build, so no bytes are persisted and nothing is served
   * back  see docs/PLAN.md, this was scoped out deliberately.
   */
  fileName: z.string().trim().max(200).nullable().optional(),
});

kycRouter.post("/", async (req, res) => {
  const parsed = kycSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid submission" });
    return;
  }

  const userId = req.userId!;
  const safeName = parsed.data.fileName?.replace(/[^\w.-]/g, "_");
  const storagePath = safeName ? `${userId}/${Date.now()}-${safeName}` : null;

  // Submitting always returns the account to `pending`: a resubmission after a
  // rejection has to be re-reviewed, not silently left rejected.
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        fullName: parsed.data.fullName,
        dob: new Date(parsed.data.dob),
        country: parsed.data.country,
        kycStatus: "pending",
      },
    }),
    prisma.kycDocument.create({
      data: { userId, docType: "identity_document", storagePath, status: "pending" },
    }),
  ]);

  res.status(201).json({ ok: true });
});
