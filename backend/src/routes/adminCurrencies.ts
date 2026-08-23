import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";

import { invalidateCurrencyCache } from "../lib/currencies";
import { prisma } from "../lib/prisma";
import { getPriceProvider } from "../lib/priceProviders";
import { requireAdmin } from "../middleware/requireAdmin";
import { requireAuth } from "../middleware/requireAuth";

export const adminCurrenciesRouter = Router();
adminCurrenciesRouter.use(requireAuth, requireAdmin);

const symbolSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9]{2,10}$/, "Use 2-10 letters or digits")
  .transform((value) => value.toUpperCase());

const currencySchema = z.object({
  symbol: symbolSchema,
  name: z.string().trim().min(2, "Enter a currency name").max(60),
  decimals: z.number().int().min(0).max(18),
  icon: z.string().trim().max(8).nullable().optional(),
  iconUrl: z.string().trim().url("Enter a valid logo URL").max(300).nullable().optional(),
  // Optional now: a `live` currency takes its price from the feed instead.
  mockPriceUsd: z.number().positive("Enter a price above zero").optional(),
  priceSource: z.enum(["manual", "live"]).optional(),
  externalPriceId: z.string().trim().min(1).max(80).nullable().optional(),
  isActive: z.boolean().optional(),
});

/** PATCH accepts any subset of the same fields. */
const currencyPatchSchema = currencySchema.partial();

type CurrencyInput = z.infer<typeof currencyPatchSchema>;

/**
 * Cross-field validation lives here rather than in a zod `.refine()` because
 * PATCH sends a subset: whether the result is valid depends on the row already
 * in the database, which the schema can't see. `existing` is null on create.
 */
function validateAgainstExisting(
  input: CurrencyInput,
  existing: { priceSource: string; externalPriceId: string | null; mockPriceUsd: unknown } | null,
): string | null {
  const priceSource = input.priceSource ?? existing?.priceSource ?? "manual";

  if (priceSource === "live") {
    const externalId =
      input.externalPriceId !== undefined
        ? input.externalPriceId
        : (existing?.externalPriceId ?? null);
    if (!externalId) return "Pick a market asset for live pricing";
    return null;
  }

  const price = input.mockPriceUsd ?? (existing ? Number(existing.mockPriceUsd) : undefined);
  if (price === undefined || !Number.isFinite(price) || price <= 0) {
    return "Enter a price above zero";
  }
  return null;
}

type SeededFields = {
  mockPriceUsd?: number;
  iconUrl?: string;
  priceChange24h?: number | null;
  priceUpdatedAt?: Date;
};

/**
 * Seeds price and logo the moment a currency is linked, so it never sits at $0
 * with a blank icon waiting for the next poll. Every failure here is
 * non-fatal  the scheduled refresh and the logo backfill catch up.
 */
async function seedFromProvider(externalId: string): Promise<SeededFields> {
  const provider = getPriceProvider();
  const seeded: SeededFields = {};

  try {
    const [quote] = await provider.fetchQuotes([externalId]);
    if (quote) {
      seeded.mockPriceUsd = quote.priceUsd;
      seeded.priceChange24h = quote.change24h;
      seeded.priceUpdatedAt = quote.asOf;
    }
  } catch {
    // Leave the price to the next refresh.
  }

  try {
    const profile = await provider.fetchProfile(externalId);
    if (profile.logoUrl) seeded.iconUrl = profile.logoUrl;
  } catch {
    // Leave the logo to the backfill.
  }

  return seeded;
}

adminCurrenciesRouter.get("/", async (_req, res) => {
  // Inactive rows included on purpose  the admin table shows both.
  const currencies = await prisma.currency.findMany({ orderBy: { symbol: "asc" } });
  res.json({ currencies });
});

adminCurrenciesRouter.get("/:id", async (req, res) => {
  const currency = await prisma.currency.findUnique({ where: { id: req.params["id"]! } });
  if (!currency) {
    res.status(404).json({ error: "Currency not found" });
    return;
  }
  res.json({ currency });
});

adminCurrenciesRouter.post("/", async (req, res) => {
  const parsed = currencySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid currency" });
    return;
  }

  const invalid = validateAgainstExisting(parsed.data, null);
  if (invalid) {
    res.status(400).json({ error: invalid });
    return;
  }

  const priceSource = parsed.data.priceSource ?? "manual";
  const externalPriceId = parsed.data.externalPriceId ?? null;
  const seeded =
    priceSource === "live" && externalPriceId ? await seedFromProvider(externalPriceId) : {};

  try {
    const currency = await prisma.currency.create({
      data: {
        symbol: parsed.data.symbol,
        name: parsed.data.name,
        decimals: parsed.data.decimals,
        icon: parsed.data.icon ?? null,
        iconUrl: seeded.iconUrl ?? parsed.data.iconUrl ?? null,
        mockPriceUsd: seeded.mockPriceUsd ?? parsed.data.mockPriceUsd ?? 0,
        priceSource,
        externalPriceId,
        priceChange24h: seeded.priceChange24h ?? null,
        priceUpdatedAt: seeded.priceUpdatedAt ?? null,
        isActive: parsed.data.isActive ?? true,
      },
    });
    invalidateCurrencyCache();
    res.status(201).json({ currency });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      res
        .status(409)
        .json({ error: `A currency with the symbol ${parsed.data.symbol} already exists` });
      return;
    }
    throw error;
  }
});

adminCurrenciesRouter.patch("/:id", async (req, res) => {
  const parsed = currencyPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid currency" });
    return;
  }

  const id = req.params["id"]!;
  const existing = await prisma.currency.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: "Currency not found" });
    return;
  }

  const invalid = validateAgainstExisting(parsed.data, existing);
  if (invalid) {
    res.status(400).json({ error: invalid });
    return;
  }

  // Re-seed only when the link actually changes, so an unrelated rename doesn't
  // spend two provider calls.
  const linkChanged =
    parsed.data.externalPriceId !== undefined &&
    parsed.data.externalPriceId !== existing.externalPriceId;
  const priceSource = parsed.data.priceSource ?? existing.priceSource;
  const externalPriceId =
    parsed.data.externalPriceId !== undefined
      ? parsed.data.externalPriceId
      : existing.externalPriceId;

  const seeded =
    linkChanged && priceSource === "live" && externalPriceId
      ? await seedFromProvider(externalPriceId)
      : {};

  try {
    const currency = await prisma.currency.update({
      where: { id },
      data: {
        ...parsed.data,
        ...(seeded.mockPriceUsd !== undefined ? { mockPriceUsd: seeded.mockPriceUsd } : {}),
        ...(seeded.priceChange24h !== undefined ? { priceChange24h: seeded.priceChange24h } : {}),
        ...(seeded.priceUpdatedAt !== undefined ? { priceUpdatedAt: seeded.priceUpdatedAt } : {}),
        // A freshly linked logo replaces the old one; otherwise leave it be.
        ...(seeded.iconUrl !== undefined ? { iconUrl: seeded.iconUrl } : {}),
      },
    });
    invalidateCurrencyCache();
    res.json({ currency });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        res.status(409).json({ error: `A currency with that symbol already exists` });
        return;
      }
      if (error.code === "P2025") {
        res.status(404).json({ error: "Currency not found" });
        return;
      }
    }
    throw error;
  }
});

/** Soft-delete: currencies are deactivated, never removed, so history stays readable. */
adminCurrenciesRouter.post("/:id/deactivate", async (req, res) => {
  try {
    const currency = await prisma.currency.update({
      where: { id: req.params["id"]! },
      data: { isActive: false },
    });
    invalidateCurrencyCache();
    res.json({ currency });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      res.status(404).json({ error: "Currency not found" });
      return;
    }
    throw error;
  }
});
