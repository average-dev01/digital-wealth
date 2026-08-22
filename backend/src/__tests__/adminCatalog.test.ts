import { describe, expect, it } from "vitest";
import request from "supertest";

import { createApp } from "../app";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../lib/password";

const app = createApp();

let counter = 0;
function uniqueEmail(label: string): string {
  counter += 1;
  return `${label}-${Date.now()}-${counter}@example.com`;
}

async function primeCsrf(agent: ReturnType<typeof request.agent>): Promise<string> {
  const res = await agent.get("/health");
  const cookies = (res.headers["set-cookie"] as unknown as string[] | undefined) ?? [];
  const raw = cookies.find((c) => c.startsWith("csrf_token="));
  if (!raw) throw new Error("csrf_token cookie was not set");
  return decodeURIComponent(raw.split(";")[0]!.split("=")[1]!);
}

/** Signs up a normal customer and returns an agent holding their session. */
async function signUpCustomer() {
  const agent = request.agent(app);
  const csrf = await primeCsrf(agent);
  const email = uniqueEmail("customer");
  await agent
    .post("/auth/signup")
    .set("X-CSRF-Token", csrf)
    .send({ email, password: "correct horse battery", fullName: "Cust Omer" });
  return { agent, csrf, email };
}

/** Creates an admin directly in the DB, then logs in as them. */
async function signInAdmin() {
  const email = uniqueEmail("admin");
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword("admin password"),
      fullName: "Desk Admin",
    },
  });
  await prisma.userRole.create({ data: { userId: user.id, role: "admin" } });

  const agent = request.agent(app);
  const csrf = await primeCsrf(agent);
  await agent
    .post("/auth/login")
    .set("X-CSRF-Token", csrf)
    .send({ email, password: "admin password" });
  return { agent, csrf, email };
}

describe("admin currency catalogue", () => {
  it("refuses anonymous and non-admin callers", async () => {
    const anonRes = await request(app).get("/admin/currencies");
    expect(anonRes.status).toBe(401);

    const { agent } = await signUpCustomer();
    const customerRes = await agent.get("/admin/currencies");
    expect(customerRes.status).toBe(403);
  });

  it("lists the seeded catalogue including inactive rows", async () => {
    const { agent, csrf } = await signInAdmin();

    const created = await agent
      .post("/admin/currencies")
      .set("X-CSRF-Token", csrf)
      .send({ symbol: "TEMP", name: "Temporary", decimals: 4, mockPriceUsd: 5 });
    expect(created.status).toBe(201);

    await agent
      .post(`/admin/currencies/${created.body.currency.id}/deactivate`)
      .set("X-CSRF-Token", csrf);

    const listRes = await agent.get("/admin/currencies");
    expect(listRes.status).toBe(200);
    const temp = listRes.body.currencies.find((c: { symbol: string }) => c.symbol === "TEMP");
    expect(temp.isActive).toBe(false);
  });

  it("creates a currency, uppercases its symbol, and rejects duplicates", async () => {
    const { agent, csrf } = await signInAdmin();

    const res = await agent
      .post("/admin/currencies")
      .set("X-CSRF-Token", csrf)
      .send({ symbol: "dot", name: "Polkadot", decimals: 6, icon: "●", mockPriceUsd: 7.25 });
    expect(res.status).toBe(201);
    expect(res.body.currency.symbol).toBe("DOT");

    const dupe = await agent
      .post("/admin/currencies")
      .set("X-CSRF-Token", csrf)
      .send({ symbol: "DOT", name: "Polkadot again", decimals: 6, mockPriceUsd: 8 });
    expect(dupe.status).toBe(409);
  });

  it("rejects an invalid symbol and a non-positive price", async () => {
    const { agent, csrf } = await signInAdmin();

    const badSymbol = await agent
      .post("/admin/currencies")
      .set("X-CSRF-Token", csrf)
      .send({ symbol: "!!", name: "Bad", decimals: 2, mockPriceUsd: 1 });
    expect(badSymbol.status).toBe(400);

    const badPrice = await agent
      .post("/admin/currencies")
      .set("X-CSRF-Token", csrf)
      .send({ symbol: "OKAY", name: "Fine", decimals: 2, mockPriceUsd: 0 });
    expect(badPrice.status).toBe(400);
  });

  it("makes a newly created currency provision a wallet for customers", async () => {
    const { agent: adminAgent, csrf: adminCsrf } = await signInAdmin();
    await adminAgent
      .post("/admin/currencies")
      .set("X-CSRF-Token", adminCsrf)
      .send({ symbol: "NEWC", name: "New Coin", decimals: 2, mockPriceUsd: 3 });

    const { agent: customerAgent } = await signUpCustomer();
    const walletsRes = await customerAgent.get("/wallets");
    expect(walletsRes.status).toBe(200);
    const codes = walletsRes.body.wallets.map((w: { currency: string }) => w.currency);
    expect(codes).toContain("NEWC");
  });

  it("stops a deactivated currency from being deposited to", async () => {
    const { agent: adminAgent, csrf: adminCsrf } = await signInAdmin();
    const currency = await prisma.currency.findUniqueOrThrow({ where: { symbol: "ETH" } });
    await adminAgent
      .post(`/admin/currencies/${currency.id}/deactivate`)
      .set("X-CSRF-Token", adminCsrf);

    const { agent: customerAgent, csrf: customerCsrf } = await signUpCustomer();
    const res = await customerAgent
      .post("/wallets/ETH/deposit")
      .set("X-CSRF-Token", customerCsrf)
      .send({ amount: 10 });
    expect(res.status).toBe(400);
  });
});

describe("admin wallet addresses", () => {
  it("refuses non-admin callers", async () => {
    const { agent } = await signUpCustomer();
    expect((await agent.get("/admin/wallet-addresses")).status).toBe(403);
  });

  it("publishes an address that customers then receive for deposits", async () => {
    const { agent: adminAgent, csrf: adminCsrf } = await signInAdmin();
    const currency = await prisma.currency.findUniqueOrThrow({ where: { symbol: "BTC" } });

    const created = await adminAgent
      .post("/admin/wallet-addresses")
      .set("X-CSRF-Token", adminCsrf)
      .send({
        currencyId: currency.id,
        address: "bc1qfreshdeskaddress000000000000000",
        network: "Bitcoin",
      });
    expect(created.status).toBe(201);

    const { agent: customerAgent } = await signUpCustomer();
    const res = await customerAgent.get("/wallets/BTC/address");
    expect(res.status).toBe(200);
    // Newest active address wins, and the network label rides along with it.
    expect(res.body.deposit.address).toBe("bc1qfreshdeskaddress000000000000000");
    expect(res.body.deposit.network).toBe("Bitcoin");
  });

  it("returns a null address when none is published for the asset", async () => {
    // Drop the seeded ETH address so nothing active remains.
    const currency = await prisma.currency.findUniqueOrThrow({ where: { symbol: "ETH" } });
    await prisma.walletAddress.deleteMany({ where: { currencyId: currency.id } });

    const { agent } = await signUpCustomer();
    const res = await agent.get("/wallets/ETH/address");
    expect(res.status).toBe(200);
    expect(res.body.deposit).toBeNull();
  });

  it("deactivating an address hides it from customers", async () => {
    const { agent: adminAgent, csrf: adminCsrf } = await signInAdmin();
    const currency = await prisma.currency.findUniqueOrThrow({ where: { symbol: "USDT" } });
    const existing = await prisma.walletAddress.findFirstOrThrow({
      where: { currencyId: currency.id },
    });

    const patched = await adminAgent
      .patch(`/admin/wallet-addresses/${existing.id}`)
      .set("X-CSRF-Token", adminCsrf)
      .send({ isActive: false });
    expect(patched.status).toBe(200);

    const { agent: customerAgent } = await signUpCustomer();
    const res = await customerAgent.get("/wallets/USDT/address");
    expect(res.body.deposit).toBeNull();
  });

  it("rejects an address for a currency that does not exist", async () => {
    const { agent, csrf } = await signInAdmin();
    const res = await agent.post("/admin/wallet-addresses").set("X-CSRF-Token", csrf).send({
      currencyId: "00000000-0000-0000-0000-000000000000",
      address: "0xdeadbeefdeadbeefdeadbeef",
      network: "Ethereum",
    });
    expect(res.status).toBe(400);
  });
});

describe("public currency catalogue", () => {
  it("is readable without signing in, so wallet cards can render real metadata", async () => {
    const res = await request(app).get("/currencies");
    expect(res.status).toBe(200);

    const btc = res.body.currencies.find((c: { symbol: string }) => c.symbol === "BTC");
    expect(btc).toMatchObject({ symbol: "BTC", name: "Bitcoin", icon: "₿", decimals: 8 });
    expect(Number(btc.mockPriceUsd)).toBeGreaterThan(0);
  });

  it("surfaces an admin-created asset with its own metadata, not a fallback", async () => {
    const { agent, csrf } = await signInAdmin();
    const created = await agent
      .post("/admin/currencies")
      .set("X-CSRF-Token", csrf)
      .send({ symbol: "NEWQ", name: "Newquay", decimals: 4, icon: "N", mockPriceUsd: 12.5 });
    expect(created.status).toBe(201);

    const res = await request(app).get("/currencies");
    const listed = res.body.currencies.find((c: { symbol: string }) => c.symbol === "NEWQ");
    // The old client-side lookup fell back to the first hardcoded asset for an
    // unknown symbol, which valued a new listing at Bitcoin's price.
    expect(listed).toMatchObject({ name: "Newquay", icon: "N", decimals: 4, isActive: true });
    expect(Number(listed.mockPriceUsd)).toBeCloseTo(12.5, 8);
  });

  it("keeps a deactivated asset listed, flagged inactive, so held balances still render", async () => {
    const { agent, csrf } = await signInAdmin();
    const currency = await prisma.currency.findUniqueOrThrow({ where: { symbol: "USDT" } });
    await agent.post(`/admin/currencies/${currency.id}/deactivate`).set("X-CSRF-Token", csrf);

    const res = await request(app).get("/currencies");
    const listed = res.body.currencies.find((c: { symbol: string }) => c.symbol === "USDT");
    expect(listed).toBeDefined();
    expect(listed.isActive).toBe(false);
  });

  it("stops provisioning wallets for a deactivated asset", async () => {
    const { agent, csrf } = await signInAdmin();
    const currency = await prisma.currency.findUniqueOrThrow({ where: { symbol: "USDT" } });
    await agent.post(`/admin/currencies/${currency.id}/deactivate`).set("X-CSRF-Token", csrf);

    const { agent: customerAgent } = await signUpCustomer();
    const wallets = (await customerAgent.get("/wallets")).body.wallets as { currency: string }[];
    expect(wallets.some((w) => w.currency === "USDT")).toBe(false);
    expect(wallets.some((w) => w.currency === "BTC")).toBe(true);
  });
});
