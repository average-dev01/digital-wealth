/**
 * The two account types are mutually exclusive: a customer never reaches the
 * desk, and the desk never holds a customer account.
 *
 * They were already exclusive by construction  `seedNewUser` grants only
 * `user`, `prisma/seed.ts` only `admin`  but nothing enforced it at the
 * request boundary, so an administrator calling `/wallets` was silently
 * provisioned a wallet. These cases pin the boundary down from both sides.
 */
import { describe, expect, it } from "vitest";
import request from "supertest";

import { createApp } from "../app";
import { hashPassword } from "../lib/password";
import { prisma } from "../lib/prisma";

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

async function signUpCustomer() {
  const agent = request.agent(app);
  const csrf = await primeCsrf(agent);
  const email = uniqueEmail("customer");
  const res = await agent
    .post("/auth/signup")
    .set("X-CSRF-Token", csrf)
    .send({ email, password: "correct horse battery", fullName: "Cust Omer" });
  return { agent, csrf, userId: res.body.user.id as string };
}

async function signInAdmin() {
  const email = uniqueEmail("admin");
  const user = await prisma.user.create({
    data: { email, passwordHash: await hashPassword("admin password"), fullName: "Desk Admin" },
  });
  await prisma.userRole.create({ data: { userId: user.id, role: "admin" } });

  const agent = request.agent(app);
  const csrf = await primeCsrf(agent);
  await agent
    .post("/auth/login")
    .set("X-CSRF-Token", csrf)
    .send({ email, password: "admin password" });
  return { agent, csrf, userId: user.id };
}

describe("administrators hold no customer account", () => {
  it("refuses an admin on every customer wallet endpoint", async () => {
    const { agent, csrf } = await signInAdmin();

    const wallets = await agent.get("/wallets");
    expect(wallets.status).toBe(403);
    expect(wallets.body.error).toMatch(/do not hold customer accounts/i);

    expect((await agent.get("/wallets/transactions")).status).toBe(403);
    expect((await agent.get("/wallets/BTC/address")).status).toBe(403);
    expect(
      (await agent.post("/wallets/BTC/deposit").set("X-CSRF-Token", csrf).send({ amount: 1 }))
        .status,
    ).toBe(403);
  });

  it("refuses an admin on KYC", async () => {
    const { agent, csrf } = await signInAdmin();

    expect((await agent.get("/kyc")).status).toBe(403);
    expect(
      (
        await agent
          .post("/kyc")
          .set("X-CSRF-Token", csrf)
          .send({ fullName: "Desk Admin", dob: "1990-01-01", country: "GB" })
      ).status,
    ).toBe(403);
  });

  it("provisions no wallet for an admin who probes the endpoint", async () => {
    const { agent, userId } = await signInAdmin();

    await agent.get("/wallets");

    // The guard has to run *before* listWallets, which self-heals by creating
    // wallets for any catalogue asset the caller is missing.
    expect(await prisma.wallet.count({ where: { userId } })).toBe(0);
  });

  it("still lets an ordinary customer through", async () => {
    const { agent } = await signUpCustomer();

    const res = await agent.get("/wallets");

    expect(res.status).toBe(200);
    expect(res.body.wallets.length).toBeGreaterThan(0);
  });
});

describe("customers never reach the desk", () => {
  it("refuses a customer on the admin surface", async () => {
    const { agent } = await signUpCustomer();

    for (const path of [
      "/admin/currencies",
      "/admin/users",
      "/admin/dashboard/stats",
      "/admin/transactions",
      "/admin/wallet-addresses",
      "/admin/price-feed/status",
    ]) {
      expect((await agent.get(path)).status, path).toBe(403);
    }
  });

  it("refuses anonymous callers with 401, not 403", async () => {
    expect((await request(app).get("/admin/users")).status).toBe(401);
    expect((await request(app).get("/wallets")).status).toBe(401);
  });
});

describe("the customer namespace excludes desk accounts", () => {
  it("omits admins from the customer list", async () => {
    const { agent } = await signInAdmin();
    await signUpCustomer();

    const res = await agent.get("/admin/users?pageSize=100");

    expect(res.status).toBe(200);
    const emails = res.body.rows.map((u: { email: string }) => u.email);
    expect(emails.some((e: string) => e.startsWith("customer-"))).toBe(true);
    expect(emails.some((e: string) => e.startsWith("admin-"))).toBe(false);
  });

  it("treats another admin id as a customer that does not exist", async () => {
    const { agent, csrf } = await signInAdmin();
    const other = await signInAdmin();

    expect((await agent.get(`/admin/users/${other.userId}`)).status).toBe(404);

    // The mutations matter more than the read: without this an admin could
    // suspend a colleague or post a balance adjustment onto a desk account.
    const suspend = await agent
      .patch(`/admin/users/${other.userId}`)
      .set("X-CSRF-Token", csrf)
      .send({ isActive: false });
    expect(suspend.status).toBe(404);

    const kyc = await agent
      .patch(`/admin/users/${other.userId}/kyc`)
      .set("X-CSRF-Token", csrf)
      .send({ status: "verified" });
    expect(kyc.status).toBe(404);

    const currency = await prisma.currency.findFirstOrThrow();
    const adjust = await agent
      .post(`/admin/users/${other.userId}/adjust-balance`)
      .set("X-CSRF-Token", csrf)
      .send({ currencyId: currency.id, amount: 5, note: "should never apply" });
    expect(adjust.status).toBe(404);

    expect(await prisma.wallet.count({ where: { userId: other.userId } })).toBe(0);
  });

  it("still reaches a real customer through the same routes", async () => {
    const { agent, csrf } = await signInAdmin();
    const customer = await signUpCustomer();

    expect((await agent.get(`/admin/users/${customer.userId}`)).status).toBe(200);

    const suspend = await agent
      .patch(`/admin/users/${customer.userId}`)
      .set("X-CSRF-Token", csrf)
      .send({ isActive: false });
    expect(suspend.status).toBe(200);
  });
});
