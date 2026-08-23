/**
 * walletService  the single seam between this app and "custody".
 *
 * IMPORTANT: balances, deposit addresses and conversions in this build are
 * SIMULATED and admin-managed. No blockchain node, exchange API or payment
 * processor is involved. Deposit addresses are the desk's published
 * per-currency addresses (see the `wallet_addresses` table), shared by every
 * customer  not per-user derived addresses.
 */
import type { Prisma, Transaction, Wallet } from "@prisma/client";

import { prisma } from "./prisma";
import { getActiveCurrencies, getCurrency, type CurrencyMeta } from "./currencies";

/** Catalogue order, with any wallet for a since-deactivated asset sorted last. */
function sortByCatalogue(wallets: Wallet[], currencies: CurrencyMeta[]): Wallet[] {
  const rank = new Map(currencies.map((c, index) => [c.code, index]));
  return wallets.sort(
    (a, b) =>
      (rank.get(a.currency) ?? Number.MAX_SAFE_INTEGER) -
      (rank.get(b.currency) ?? Number.MAX_SAFE_INTEGER),
  );
}

/**
 * Hides wallets for delisted assets  but only when they are empty.
 *
 * A deactivated currency should disappear from the customer's dashboard; an
 * empty card for an asset the desk no longer offers is just clutter. A balance
 * is different: that is the customer's money, and hiding the card would strand
 * it with no way to withdraw. Those keep their card, which the UI already
 * marks as delisted with deposits disabled.
 */
function visibleWallets(wallets: Wallet[], currencies: CurrencyMeta[]): Wallet[] {
  const active = new Set(currencies.map((c) => c.code));
  return wallets.filter((w) => active.has(w.currency) || Number(w.balance) > 0);
}

export async function listWallets(userId: string): Promise<Wallet[]> {
  const currencies = await getActiveCurrencies();
  const existing = await prisma.wallet.findMany({ where: { userId } });

  // Self-healing: an asset added to the catalogue after this user signed up
  // gets a wallet on next read, so the dashboard never has a missing card.
  const missing = currencies.filter((c) => !existing.some((w) => w.currency === c.code));
  if (missing.length > 0) {
    await prisma.wallet.createMany({
      data: missing.map((c) => ({ userId, currency: c.code, balance: 0 })),
      skipDuplicates: true,
    });
    const refreshed = await prisma.wallet.findMany({ where: { userId } });
    return sortByCatalogue(visibleWallets(refreshed, currencies), currencies);
  }

  return sortByCatalogue(visibleWallets(existing, currencies), currencies);
}

export function listTransactions(userId: string): Promise<Transaction[]> {
  return prisma.transaction.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
}

/**
 * The desk's published deposit address for an asset. Null when no active
 * address exists  customers can't be given somewhere to send funds until an
 * administrator publishes one, which the deposit dialog surfaces as an
 * empty state rather than an error.
 */
export async function getDepositAddress(
  code: string,
): Promise<{ address: string; network: string } | null> {
  const currency = await prisma.currency.findUnique({ where: { symbol: code } });
  if (!currency) return null;

  const published = await prisma.walletAddress.findFirst({
    where: { currencyId: currency.id, isActive: true },
    orderBy: { createdAt: "desc" },
  });
  if (!published) return null;

  // The network label comes from the published address row rather than any
  // hardcoded table, so it always describes the chain the desk is actually
  // accepting this asset on.
  return { address: published.address, network: published.network };
}

/**
 * Customer says "I've sent my deposit" -> creates a PENDING transaction for
 * admin review. In a real build, chain monitoring would create this row.
 */
export async function requestDeposit(userId: string, code: string, amount: number): Promise<void> {
  const wallet = (await listWallets(userId)).find((w) => w.currency === code);
  await prisma.transaction.create({
    data: {
      userId,
      walletId: wallet?.id ?? null,
      type: "deposit",
      currency: code,
      amount,
      status: "pending",
      notes: "Customer-declared deposit awaiting confirmation (simulated)",
    },
  });
}

export async function requestWithdrawal(
  userId: string,
  code: string,
  amount: number,
  destination: string,
): Promise<void> {
  const wallet = (await listWallets(userId)).find((w) => w.currency === code);
  if (!wallet) throw new Error("Wallet not found");
  if (Number(wallet.balance) < amount) throw new Error("Insufficient balance");

  await prisma.transaction.create({
    data: {
      userId,
      walletId: wallet.id,
      type: "withdrawal",
      currency: code,
      amount,
      status: "pending",
      destinationAddress: destination,
      notes: "Withdrawal request awaiting review (no funds move in this build)",
    },
  });
}

/**
 * SIMULATED conversion at mock rates, settled instantly for demo purposes.
 * A real build would route this to an execution venue and settle async.
 */
export async function convert(
  userId: string,
  from: string,
  to: string,
  amount: number,
): Promise<number> {
  const [fromMeta, toMeta] = await Promise.all([getCurrency(from), getCurrency(to)]);
  if (!fromMeta || !toMeta) throw new Error("Unsupported currency");

  const wallets = await listWallets(userId);
  const src = wallets.find((w) => w.currency === from);
  const dst = wallets.find((w) => w.currency === to);
  if (!src || !dst) throw new Error("Wallet not found");
  if (Number(src.balance) < amount) throw new Error("Insufficient balance");

  const received = (amount * fromMeta.mockPriceUsd) / toMeta.mockPriceUsd;

  await prisma.$transaction([
    prisma.wallet.update({
      where: { id: src.id },
      data: { balance: Number(src.balance) - amount },
    }),
    prisma.wallet.update({
      where: { id: dst.id },
      data: { balance: Number(dst.balance) + received },
    }),
    prisma.transaction.create({
      data: {
        userId,
        walletId: src.id,
        type: "convert",
        currency: from,
        amount: -amount,
        status: "completed",
        notes: `Converted to ${to} at simulated rate`,
      },
    }),
    prisma.transaction.create({
      data: {
        userId,
        walletId: dst.id,
        type: "convert",
        currency: to,
        amount: received,
        status: "completed",
        notes: `Converted from ${from} at simulated rate`,
      },
    }),
  ]);

  return received;
}

/**
 * Admin-only: credit (positive) or debit (negative) a customer wallet and
 * write the matching ledger entry, bypassing the deposit/withdrawal queues.
 * Creates the wallet if the customer doesn't hold that asset yet. Balance
 * read and write happen in one transaction so two concurrent adjustments
 * can't both pass the negative-balance guard off the same stale read.
 */
export async function adminAdjustBalance(
  userId: string,
  code: string,
  delta: number,
  note: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUnique({
      where: { userId_currency: { userId, currency: code } },
    });
    const nextBalance = Number(wallet?.balance ?? 0) + delta;
    if (nextBalance < 0) throw new Error("Adjustment would make the balance negative");

    const settled = wallet
      ? await tx.wallet.update({ where: { id: wallet.id }, data: { balance: nextBalance } })
      : await tx.wallet.create({ data: { userId, currency: code, balance: nextBalance } });

    await tx.transaction.create({
      data: {
        userId,
        walletId: settled.id,
        type: "admin_adjustment",
        currency: code,
        amount: delta,
        status: "completed",
        createdByAdmin: true,
        notes: note || "Manual balance adjustment by administrator",
      },
    });
  });
}

/**
 * Admin settles a pending deposit/withdrawal. `completed` moves the balance
 * (credit for a deposit, debit for a withdrawal); `rejected` only marks the
 * row. The whole thing is one transaction, and the pending-status check is
 * re-read inside it, so a double-click can't settle the same request twice.
 */
export async function settleTransaction(
  txId: string,
  status: "completed" | "rejected",
  note?: string,
): Promise<Transaction> {
  return prisma.$transaction(async (tx) => {
    const pending = await tx.transaction.findUnique({ where: { id: txId } });
    if (!pending) throw new Error("Transaction not found");
    if (pending.status !== "pending") throw new Error("This request has already been reviewed");

    if (status === "completed" && (pending.type === "deposit" || pending.type === "withdrawal")) {
      const wallet = await tx.wallet.findUnique({
        where: { userId_currency: { userId: pending.userId, currency: pending.currency } },
      });
      if (!wallet) throw new Error("Wallet not found");

      const delta = pending.type === "deposit" ? Number(pending.amount) : -Number(pending.amount);
      const nextBalance = Number(wallet.balance) + delta;
      if (nextBalance < 0) throw new Error("Insufficient balance to settle this withdrawal");

      await tx.wallet.update({ where: { id: wallet.id }, data: { balance: nextBalance } });
    }

    return tx.transaction.update({
      where: { id: txId },
      data: {
        status,
        ...(note ? { notes: note } : {}),
      },
    });
  });
}

/**
 * New-signup bootstrap: the customer role plus an empty wallet per active
 * currency. Runs inside the same transaction as user creation so a partial
 * signup can't leave a user without them.
 *
 * Balances start at zero and no transactions are written  every row in a
 * customer's history is the result of a real deposit, withdrawal, conversion
 * or admin adjustment.
 */
export async function seedNewUser(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.userRole.create({ data: { userId, role: "user" } });

  const currencies = await getActiveCurrencies();
  if (currencies.length === 0) return;

  await tx.wallet.createMany({
    data: currencies.map((currency) => ({ userId, currency: currency.code, balance: 0 })),
    skipDuplicates: true,
  });
}
