/**
 * Money-movement coverage: approving/rejecting deposits and withdrawals, and
 * manual balance adjustments. These are the paths where a silent bug would be
 * worst, so each one asserts the resulting balance, not just the status code.
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
  const email = uniqueEmail("cust");
  const res = await agent
    .post("/auth/signup")
    .set("X-CSRF-Token", csrf)
    .send({ email, password: "correct horse battery", fullName: "Cust Omer" });
  return { agent, csrf, email, userId: res.body.user.id as string };
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
  return { agent, csrf };
}

/**
 * Gives a wallet a starting balance. Signups begin at zero now  the app
 * fabricates no opening balance  so any test that moves money *out* of a
 * wallet has to put it there first, explicitly.
 */
async function fundWallet(userId: string, currency: string, amount: number): Promise<void> {
  await prisma.wallet.update({
    where: { userId_currency: { userId, currency } },
    data: { balance: amount },
  });
}

async function balanceOf(userId: string, currency: string): Promise<number> {
  const wallet = await prisma.wallet.findUnique({
    where: { userId_currency: { userId, currency } },
  });
  return Number(wallet?.balance ?? 0);
}

describe("deposit review", () => {
  it("approving a deposit credits the wallet", async () => {
    const customer = await signUpCustomer();
    const before = await balanceOf(customer.userId, "BTC");

    await customer.agent
      .post("/wallets/BTC/deposit")
      .set("X-CSRF-Token", customer.csrf)
      .send({ amount: 0.5 });
    const pending = await prisma.transaction.findFirstOrThrow({
      where: { userId: customer.userId, type: "deposit", status: "pending" },
    });

    const admin = await signInAdmin();
    const res = await admin.agent
      .post(`/admin/transactions/${pending.id}/review`)
      .set("X-CSRF-Token", admin.csrf)
      .send({ status: "completed", note: "Confirmed on explorer" });

    expect(res.status).toBe(200);
    expect(res.body.transaction.status).toBe("completed");
    expect(await balanceOf(customer.userId, "BTC")).toBeCloseTo(before + 0.5, 8);
  });

  it("rejecting a deposit leaves the balance untouched", async () => {
    const customer = await signUpCustomer();
    const before = await balanceOf(customer.userId, "BTC");

    await customer.agent
      .post("/wallets/BTC/deposit")
      .set("X-CSRF-Token", customer.csrf)
      .send({ amount: 0.5 });
    const pending = await prisma.transaction.findFirstOrThrow({
      where: { userId: customer.userId, type: "deposit", status: "pending" },
    });

    const admin = await signInAdmin();
    const res = await admin.agent
      .post(`/admin/transactions/${pending.id}/review`)
      .set("X-CSRF-Token", admin.csrf)
      .send({ status: "rejected", note: "Never arrived" });

    expect(res.status).toBe(200);
    expect(await balanceOf(customer.userId, "BTC")).toBeCloseTo(before, 8);
  });

  it("refuses to review the same request twice", async () => {
    const customer = await signUpCustomer();
    await customer.agent
      .post("/wallets/BTC/deposit")
      .set("X-CSRF-Token", customer.csrf)
      .send({ amount: 0.25 });
    const pending = await prisma.transaction.findFirstOrThrow({
      where: { userId: customer.userId, type: "deposit", status: "pending" },
    });

    const admin = await signInAdmin();
    await admin.agent
      .post(`/admin/transactions/${pending.id}/review`)
      .set("X-CSRF-Token", admin.csrf)
      .send({ status: "completed" });
    const second = await admin.agent
      .post(`/admin/transactions/${pending.id}/review`)
      .set("X-CSRF-Token", admin.csrf)
      .send({ status: "completed" });

    expect(second.status).toBe(400);
    expect(second.body.error).toMatch(/already been reviewed/i);
  });
});

describe("withdrawal review", () => {
  it("completing a withdrawal debits the wallet", async () => {
    const customer = await signUpCustomer();
    await fundWallet(customer.userId, "BTC", 2);
    const before = await balanceOf(customer.userId, "BTC");

    await customer.agent
      .post("/wallets/BTC/withdraw")
      .set("X-CSRF-Token", customer.csrf)
      .send({ amount: 0.1, destinationAddress: "bc1qexternaldestination0001" });
    const pending = await prisma.transaction.findFirstOrThrow({
      where: { userId: customer.userId, type: "withdrawal", status: "pending" },
    });

    const admin = await signInAdmin();
    const res = await admin.agent
      .post(`/admin/transactions/${pending.id}/review`)
      .set("X-CSRF-Token", admin.csrf)
      .send({ status: "completed" });

    expect(res.status).toBe(200);
    expect(res.body.transaction.status).toBe("completed");
    expect(await balanceOf(customer.userId, "BTC")).toBeCloseTo(before - 0.1, 8);
  });

  it("rejecting a withdrawal returns nothing to the wallet (funds never left)", async () => {
    const customer = await signUpCustomer();
    await fundWallet(customer.userId, "BTC", 2);
    const before = await balanceOf(customer.userId, "BTC");

    await customer.agent
      .post("/wallets/BTC/withdraw")
      .set("X-CSRF-Token", customer.csrf)
      .send({ amount: 0.1, destinationAddress: "bc1qexternaldestination0002" });
    const pending = await prisma.transaction.findFirstOrThrow({
      where: { userId: customer.userId, type: "withdrawal", status: "pending" },
    });

    const admin = await signInAdmin();
    await admin.agent
      .post(`/admin/transactions/${pending.id}/review`)
      .set("X-CSRF-Token", admin.csrf)
      .send({ status: "rejected", note: "Address failed screening" });

    expect(await balanceOf(customer.userId, "BTC")).toBeCloseTo(before, 8);
  });

  it("refuses to complete a withdrawal that would overdraw the wallet", async () => {
    const customer = await signUpCustomer();
    await fundWallet(customer.userId, "BTC", 2);
    const before = await balanceOf(customer.userId, "BTC");

    // Request the full balance twice; only the first can legitimately settle.
    for (const n of [1, 2]) {
      await customer.agent
        .post("/wallets/BTC/withdraw")
        .set("X-CSRF-Token", customer.csrf)
        .send({ amount: before, destinationAddress: `bc1qexternaldestination000${n}` });
    }
    const pendings = await prisma.transaction.findMany({
      where: { userId: customer.userId, type: "withdrawal", status: "pending" },
    });
    expect(pendings).toHaveLength(2);

    const admin = await signInAdmin();
    const first = await admin.agent
      .post(`/admin/transactions/${pendings[0]!.id}/review`)
      .set("X-CSRF-Token", admin.csrf)
      .send({ status: "completed" });
    expect(first.status).toBe(200);

    const second = await admin.agent
      .post(`/admin/transactions/${pendings[1]!.id}/review`)
      .set("X-CSRF-Token", admin.csrf)
      .send({ status: "completed" });
    expect(second.status).toBe(400);
    expect(second.body.error).toMatch(/insufficient balance/i);

    // Balance bottomed out at zero rather than going negative.
    expect(await balanceOf(customer.userId, "BTC")).toBeCloseTo(0, 8);
  });
});

describe("manual balance adjustment", () => {
  async function btcCurrencyId(): Promise<string> {
    const currency = await prisma.currency.findUniqueOrThrow({ where: { symbol: "BTC" } });
    return currency.id;
  }

  it("credits a wallet and writes an admin_adjustment entry", async () => {
    const customer = await signUpCustomer();
    const before = await balanceOf(customer.userId, "BTC");
    const admin = await signInAdmin();

    const res = await admin.agent
      .post(`/admin/users/${customer.userId}/adjust-balance`)
      .set("X-CSRF-Token", admin.csrf)
      .send({ currencyId: await btcCurrencyId(), amount: 1.5, note: "Goodwill credit" });

    expect(res.status).toBe(200);
    expect(await balanceOf(customer.userId, "BTC")).toBeCloseTo(before + 1.5, 8);

    const entry = await prisma.transaction.findFirstOrThrow({
      where: { userId: customer.userId, type: "admin_adjustment", notes: "Goodwill credit" },
    });
    expect(entry.createdByAdmin).toBe(true);
    expect(Number(entry.amount)).toBeCloseTo(1.5, 8);
  });

  it("debits a wallet on a negative amount", async () => {
    const customer = await signUpCustomer();
    await fundWallet(customer.userId, "BTC", 2);
    const before = await balanceOf(customer.userId, "BTC");
    const admin = await signInAdmin();

    await admin.agent
      .post(`/admin/users/${customer.userId}/adjust-balance`)
      .set("X-CSRF-Token", admin.csrf)
      .send({ currencyId: await btcCurrencyId(), amount: -0.05, note: "Fee correction" });

    expect(await balanceOf(customer.userId, "BTC")).toBeCloseTo(before - 0.05, 8);
  });

  it("refuses a debit that would push the balance negative", async () => {
    const customer = await signUpCustomer();
    const before = await balanceOf(customer.userId, "BTC");
    const admin = await signInAdmin();

    const res = await admin.agent
      .post(`/admin/users/${customer.userId}/adjust-balance`)
      .set("X-CSRF-Token", admin.csrf)
      .send({ currencyId: await btcCurrencyId(), amount: -(before + 1), note: "Too much" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/negative/i);
    expect(await balanceOf(customer.userId, "BTC")).toBeCloseTo(before, 8);
  });

  it("requires a note and a non-zero amount", async () => {
    const customer = await signUpCustomer();
    const admin = await signInAdmin();
    const currencyId = await btcCurrencyId();

    const noNote = await admin.agent
      .post(`/admin/users/${customer.userId}/adjust-balance`)
      .set("X-CSRF-Token", admin.csrf)
      .send({ currencyId, amount: 1, note: "" });
    expect(noNote.status).toBe(400);

    const zero = await admin.agent
      .post(`/admin/users/${customer.userId}/adjust-balance`)
      .set("X-CSRF-Token", admin.csrf)
      .send({ currencyId, amount: 0, note: "Nothing to do" });
    expect(zero.status).toBe(400);
  });
});

describe("admin user administration", () => {
  it("suspending an account blocks login and revokes existing sessions", async () => {
    const customer = await signUpCustomer();
    const admin = await signInAdmin();

    // Session works before suspension.
    expect((await customer.agent.get("/auth/me")).status).toBe(200);

    const res = await admin.agent
      .patch(`/admin/users/${customer.userId}`)
      .set("X-CSRF-Token", admin.csrf)
      .send({ isActive: false });
    expect(res.status).toBe(200);

    // Refresh is refused, so the session can't be silently extended.
    const refreshed = await customer.agent.post("/auth/refresh").set("X-CSRF-Token", customer.csrf);
    expect(refreshed.status).toBe(401);

    const login = await request
      .agent(app)
      .post("/auth/login")
      .set("X-CSRF-Token", customer.csrf)
      .set("Cookie", [`csrf_token=${customer.csrf}`])
      .send({ email: customer.email, password: "correct horse battery" });
    expect(login.status).toBe(403);
    expect(login.body.error).toMatch(/suspended/i);
  });

  it("records a KYC decision on the user and their documents", async () => {
    const customer = await signUpCustomer();
    await prisma.kycDocument.create({
      data: { userId: customer.userId, docType: "identity_document", status: "pending" },
    });
    const admin = await signInAdmin();

    const res = await admin.agent
      .patch(`/admin/users/${customer.userId}/kyc`)
      .set("X-CSRF-Token", admin.csrf)
      .send({ status: "verified" });

    expect(res.status).toBe(200);
    expect(res.body.profile.kycStatus).toBe("verified");
    const doc = await prisma.kycDocument.findFirstOrThrow({ where: { userId: customer.userId } });
    expect(doc.status).toBe("verified");
  });

  it("paginates and filters the customer list, excluding admins", async () => {
    const admin = await signInAdmin();
    await signUpCustomer();
    await signUpCustomer();
    await signUpCustomer();

    const page = await admin.agent.get("/admin/users?page=1&pageSize=2");
    expect(page.status).toBe(200);
    expect(page.body.rows).toHaveLength(2);
    expect(page.body.total).toBeGreaterThanOrEqual(3);
    expect(page.body.totalPages).toBeGreaterThanOrEqual(2);
    // Desk staff must never appear in the customer list.
    expect(page.body.rows.some((r: { email: string }) => r.email.startsWith("admin-"))).toBe(false);
  });
});

describe("kyc and contact", () => {
  it("submitting KYC updates the profile and files a pending document", async () => {
    const customer = await signUpCustomer();

    const res = await customer.agent.post("/kyc").set("X-CSRF-Token", customer.csrf).send({
      fullName: "Ada Lovelace",
      dob: "1990-05-01",
      country: "GB",
      fileName: "passport scan.jpg",
    });
    expect(res.status).toBe(201);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: customer.userId } });
    expect(user.fullName).toBe("Ada Lovelace");
    expect(user.kycStatus).toBe("pending");

    const doc = await prisma.kycDocument.findFirstOrThrow({ where: { userId: customer.userId } });
    // Filename only  no bytes are stored in this build.
    expect(doc.storagePath).toContain("passport_scan.jpg");
  });

  it("stores a public contact submission and validates it", async () => {
    const agent = request.agent(app);
    const csrf = await primeCsrf(agent);

    const res = await agent.post("/contact").set("X-CSRF-Token", csrf).send({
      name: "Jo Bloggs",
      email: "jo@example.com",
      message: "I would like to open an account.",
    });
    expect(res.status).toBe(201);

    const stored = await prisma.contactSubmission.findFirstOrThrow({
      where: { email: "jo@example.com" },
    });
    expect(stored.name).toBe("Jo Bloggs");

    const invalid = await agent
      .post("/contact")
      .set("X-CSRF-Token", csrf)
      .send({ name: "J", email: "not-an-email", message: "hi" });
    expect(invalid.status).toBe(400);
  });
});
