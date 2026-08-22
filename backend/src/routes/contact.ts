import { Router } from "express";
import { z } from "zod";

import { prisma } from "../lib/prisma";
import { contactRateLimit } from "../middleware/rateLimit";

/** Public — the marketing site's contact form posts here unauthenticated. */
export const contactRouter = Router();

const contactSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(120),
  email: z.string().trim().email("Enter a valid email address").max(255),
  message: z.string().trim().min(10, "Tell us a little more").max(4000),
});

contactRouter.post("/", contactRateLimit, async (req, res) => {
  const parsed = contactSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid submission" });
    return;
  }

  await prisma.contactSubmission.create({ data: parsed.data });
  // No notification is sent — there's no email provider in this build. The
  // submission is stored for the desk to read.
  res.status(201).json({ ok: true });
});
