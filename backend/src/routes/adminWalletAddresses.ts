import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";

import { prisma } from "../lib/prisma";
import { requireAdmin } from "../middleware/requireAdmin";
import { requireAuth } from "../middleware/requireAuth";

export const adminWalletAddressesRouter = Router();
adminWalletAddressesRouter.use(requireAuth, requireAdmin);

const addressSchema = z.object({
  currencyId: z.string().min(1, "Select a currency"),
  address: z.string().trim().min(12, "Enter a valid deposit address").max(120),
  network: z.string().trim().min(2, "Enter the network").max(60),
  isActive: z.boolean().optional(),
});

const addressPatchSchema = addressSchema.partial();

adminWalletAddressesRouter.get("/", async (_req, res) => {
  const addresses = await prisma.walletAddress.findMany({ orderBy: { createdAt: "desc" } });
  res.json({ addresses });
});

adminWalletAddressesRouter.post("/", async (req, res) => {
  const parsed = addressSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid wallet address" });
    return;
  }

  try {
    const address = await prisma.walletAddress.create({
      data: {
        currencyId: parsed.data.currencyId,
        address: parsed.data.address,
        network: parsed.data.network,
        isActive: parsed.data.isActive ?? true,
      },
    });
    res.status(201).json({ address });
  } catch (error) {
    // Foreign key violation: the referenced currency doesn't exist.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      res.status(400).json({ error: "That currency no longer exists" });
      return;
    }
    throw error;
  }
});

adminWalletAddressesRouter.patch("/:id", async (req, res) => {
  const parsed = addressPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid wallet address" });
    return;
  }

  try {
    const address = await prisma.walletAddress.update({
      where: { id: req.params["id"]! },
      data: parsed.data,
    });
    res.json({ address });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") {
        res.status(404).json({ error: "Wallet address not found" });
        return;
      }
      if (error.code === "P2003") {
        res.status(400).json({ error: "That currency no longer exists" });
        return;
      }
    }
    throw error;
  }
});
