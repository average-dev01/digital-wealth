import { Router } from "express";
import { z } from "zod";

import { requireAuth } from "../middleware/requireAuth";
import { requireCustomer } from "../middleware/requireCustomer";
import { isValidCurrency } from "../lib/currencies";
import {
  convert,
  getDepositAddress,
  listTransactions,
  listWallets,
  requestDeposit,
  requestWithdrawal,
} from "../lib/walletService";

export const walletsRouter = Router();
// Customers only: desk staff hold no wallets, so an admin hitting these
// would otherwise be provisioned one on the fly.
walletsRouter.use(requireAuth, requireCustomer);

walletsRouter.get("/", async (req, res) => {
  res.json({ wallets: await listWallets(req.userId!) });
});

walletsRouter.get("/transactions", async (req, res) => {
  res.json({ transactions: await listTransactions(req.userId!) });
});

walletsRouter.get("/:code/address", async (req, res) => {
  const code = req.params["code"] ?? "";
  if (!(await isValidCurrency(code))) {
    res.status(400).json({ error: "Unsupported currency" });
    return;
  }
  // null when the desk hasn't published an address for this asset yet — a
  // valid state the deposit dialog renders as an empty state, not an error.
  res.json({ deposit: await getDepositAddress(code) });
});

const amountSchema = z.object({ amount: z.number().positive() });

walletsRouter.post("/:code/deposit", async (req, res) => {
  const code = req.params["code"] ?? "";
  const parsed = amountSchema.safeParse(req.body);
  if (!(await isValidCurrency(code)) || !parsed.success) {
    res.status(400).json({ error: "Enter a valid amount" });
    return;
  }
  await requestDeposit(req.userId!, code, parsed.data.amount);
  res.status(201).json({ ok: true });
});

const withdrawSchema = z.object({
  amount: z.number().positive(),
  destinationAddress: z.string().trim().min(12, "Enter a valid destination address"),
});

walletsRouter.post("/:code/withdraw", async (req, res) => {
  const code = req.params["code"] ?? "";
  const parsed = withdrawSchema.safeParse(req.body);
  if (!(await isValidCurrency(code)) || !parsed.success) {
    res
      .status(400)
      .json({ error: parsed.success ? "Unsupported currency" : parsed.error.issues[0]?.message });
    return;
  }
  try {
    await requestWithdrawal(req.userId!, code, parsed.data.amount, parsed.data.destinationAddress);
    res.status(201).json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Withdrawal failed" });
  }
});

const convertSchema = z.object({
  from: z.string(),
  to: z.string(),
  amount: z.number().positive(),
});

walletsRouter.post("/convert", async (req, res) => {
  const parsed = convertSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid conversion request" });
    return;
  }
  const [fromValid, toValid] = await Promise.all([
    isValidCurrency(parsed.data.from),
    isValidCurrency(parsed.data.to),
  ]);
  if (!fromValid || !toValid) {
    res.status(400).json({ error: "Enter a valid conversion request" });
    return;
  }
  try {
    const received = await convert(
      req.userId!,
      parsed.data.from,
      parsed.data.to,
      parsed.data.amount,
    );
    res.json({ received });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Conversion failed" });
  }
});
