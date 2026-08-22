/**
 * What a customer sees after the desk deactivates a currency.
 *
 * The rule has two halves, and the second is the one that matters: an empty
 * wallet for a delisted asset is clutter and disappears, but a wallet with a
 * balance stays visible. That balance is the customer's money — hiding the card
 * would strand it with no route to a withdrawal.
 */
import { describe, expect, it } from "vitest";
import request from "supertest";

import { createApp } from "../app";
import { invalidateCurrencyCache } from "../lib/currencies";
import { prisma } from "../lib/prisma";

const app = createApp();

let counter = 0;
function uniqueEmail(): string {
  counter += 1;
  return `delisted-${Date.now()}-${counter}@example.com`;
}

async function primeCsrf(agent: ReturnType<typeof request.agent>): Promise<string> {
  const res = await agent.get("/health");
  const cookies = (res.headers["set-cookie"] as unknown as string[] | undefined) ?? [];
  const raw = cookies.find((c) => c.startsWith("csrf_token="));
  if (!raw) throw new Error("csrf_token cookie was not set");
  return decodeURIComponent(raw.split(";")[0]!.split("=")[1]!);
}

async function signUpCustomer() {
  const agent = request.agent(app);
  const csrf = await primeCsrf(agent);
  const res = await agent
    .post("/auth/signup")
    .set("X-CSRF-Token", csrf)
    .send({ email: uniqueEmail(), password: "correct horse battery", fullName: "Cust Omer" });
  return { agent, csrf, userId: res.body.user.id as string };
}

async function deactivate(symbol: string) {
  await prisma.currency.update({ where: { symbol }, data: { isActive: false } });
  invalidateCurrencyCache();
}

async function walletCodes(agent: ReturnType<typeof request.agent>): Promise<string[]> {
  const res = await agent.get("/wallets");
  expect(res.status).toBe(200);
  return res.body.wallets.map((w: { currency: string }) => w.currency);
}

describe("deactivated currencies on the customer dashboard", () => {
  it("hides an empty wallet for a delisted asset", async () => {
    const { agent } = await signUpCustomer();
    expect(await walletCodes(agent)).toContain("ETH");

    await deactivate("ETH");

    expect(await walletCodes(agent)).not.toContain("ETH");
  });

  it("keeps the wallet visible while the customer still holds a balance", async () => {
    const { agent, userId } = await signUpCustomer();
    await prisma.wallet.update({
      where: { userId_currency: { userId, currency: "ETH" } },
      data: { balance: 2.5 },
    });

    await deactivate("ETH");

    // Still listed — this is the customer's money, and the UI marks the card
    // delisted with deposits disabled rather than making it vanish.
    expect(await walletCodes(agent)).toContain("ETH");
  });

  it("hides the wallet once that balance is withdrawn to zero", async () => {
    const { agent, userId } = await signUpCustomer();
    await prisma.wallet.update({
      where: { userId_currency: { userId, currency: "ETH" } },
      data: { balance: 2.5 },
    });
    await deactivate("ETH");
    expect(await walletCodes(agent)).toContain("ETH");

    await prisma.wallet.update({
      where: { userId_currency: { userId, currency: "ETH" } },
      data: { balance: 0 },
    });

    expect(await walletCodes(agent)).not.toContain("ETH");
  });

  it("leaves the still-active assets alone", async () => {
    const { agent } = await signUpCustomer();

    await deactivate("ETH");

    const codes = await walletCodes(agent);
    expect(codes).toContain("BTC");
    expect(codes).toContain("USDT");
  });

  it("does not re-provision the delisted wallet on the next read", async () => {
    const { agent } = await signUpCustomer();
    await deactivate("ETH");

    await walletCodes(agent);
    await walletCodes(agent);

    // listWallets self-heals missing wallets from the *active* catalogue, so a
    // delisted asset must never come back through that path.
    expect(await walletCodes(agent)).not.toContain("ETH");
  });

  it("never provisions a delisted asset for a brand-new signup", async () => {
    await deactivate("ETH");

    const { agent } = await signUpCustomer();

    expect(await walletCodes(agent)).not.toContain("ETH");
  });
});
