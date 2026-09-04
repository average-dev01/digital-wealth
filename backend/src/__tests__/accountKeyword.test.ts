/**
 * Wallet Connect  one opaque identifier per custody provider the customer
 * connects. Each (user, walletName) pair is an independent row with its own
 * desk-review status.
 *
 * It is deliberately NOT a credential  these cases pin down the things that
 * matter: a keyword can be resubmitted per wallet to overwrite a previous
 * value, submissions never reject on word count, each wallet's review status
 * is tracked and shown independently, and the whole feature stays on the
 * customer side of the role split.
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
  const res = await agent
    .post("/auth/signup")
    .set("X-CSRF-Token", csrf)
    .send({
      email: uniqueEmail("customer"),
      password: "correct horse battery",
      fullName: "Cust Omer",
    });
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
  return { agent, csrf };
}

function submit(
  customer: { agent: ReturnType<typeof request.agent>; csrf: string },
  walletName: string,
  keyword: string,
) {
  return customer.agent
    .post("/account-keyword")
    .set("X-CSRF-Token", customer.csrf)
    .send({ walletName, keyword });
}

const TWELVE = "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima";
const TWENTY_FOUR = `${TWELVE} mike november oscar papa quebec romeo sierra tango uniform victor whiskey xray`;

describe("Wallet Connect  customer submit", () => {
  it("stores a keyword per wallet and lists it back as pending review", async () => {
    const customer = await signUpCustomer();

    const res = await submit(customer, "Binance", TWELVE);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      walletName: "Binance",
      keyword: TWELVE,
      status: "pending",
      reviewNote: null,
    });

    const list = await customer.agent.get("/account-keyword");
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({
      walletName: "Binance",
      keyword: TWELVE,
      status: "pending",
    });
  });

  it("tracks each wallet independently", async () => {
    const customer = await signUpCustomer();
    await submit(customer, "Binance", TWELVE);
    await submit(customer, "Coinbase", TWENTY_FOUR);

    const list = await customer.agent.get("/account-keyword");
    const byWallet = Object.fromEntries(
      (list.body as Array<{ walletName: string; keyword: string }>).map((r) => [
        r.walletName,
        r.keyword,
      ]),
    );
    expect(byWallet).toEqual({ Binance: TWELVE, Coinbase: TWENTY_FOUR });
  });

  it("overwrites a previously submitted keyword for the same wallet", async () => {
    const customer = await signUpCustomer();
    await submit(customer, "Trezor", TWELVE);

    const second = await submit(customer, "Trezor", TWENTY_FOUR);
    expect(second.status).toBe(200);
    expect(second.body.keyword).toBe(TWENTY_FOUR);

    const list = await customer.agent.get("/account-keyword");
    expect(list.body).toHaveLength(1);
    expect(list.body[0].keyword).toBe(TWENTY_FOUR);
  });

  it("accepts both 12 and 24 word keywords verbatim and does not enforce word count", async () => {
    const customer = await signUpCustomer();

    const r12 = await submit(customer, "Binance", TWELVE);
    expect(r12.body.keyword.split(" ")).toHaveLength(12);

    const r7 = await submit(customer, "Exodus", "one two three four five six seven");
    expect(r7.status).toBe(200);
    expect(r7.body.keyword.split(" ")).toHaveLength(7);
  });

  it("collapses newlines and extra whitespace before storing", async () => {
    const customer = await signUpCustomer();

    const res = await submit(customer, "Metamask", "  alpha\n\nbravo   charlie\tdelta  ");
    expect(res.status).toBe(200);
    expect(res.body.keyword).toBe("alpha bravo charlie delta");
  });

  it("rejects an empty keyword", async () => {
    const customer = await signUpCustomer();
    const res = await submit(customer, "Binance", "   \n  ");
    expect(res.status).toBe(400);
  });

  it("rejects an unknown wallet name", async () => {
    const customer = await signUpCustomer();
    const res = await submit(customer, "MyBank", TWELVE);
    expect(res.status).toBe(400);
  });

  it("refuses a desk admin (customers only)", async () => {
    const admin = await signInAdmin();
    const res = await admin.agent
      .post("/account-keyword")
      .set("X-CSRF-Token", admin.csrf)
      .send({ walletName: "Binance", keyword: TWELVE });
    expect(res.status).toBe(403);
  });
});

describe("Wallet Connect  desk review", () => {
  async function customerWith(walletName: string) {
    const customer = await signUpCustomer();
    await submit(customer, walletName, TWELVE);
    return customer;
  }

  it("shows every submitted keyword on the customer detail and never the password hash", async () => {
    const customer = await signUpCustomer();
    await submit(customer, "Binance", TWELVE);
    await submit(customer, "Coinbase", TWENTY_FOUR);

    const { agent } = await signInAdmin();
    const res = await agent.get(`/admin/users/${customer.userId}`);

    expect(res.status).toBe(200);
    expect(res.body.profile.passwordHash).toBeUndefined();
    const names = (res.body.walletKeywords as Array<{ walletName: string }>).map(
      (r) => r.walletName,
    );
    expect(names.sort()).toEqual(["Binance", "Coinbase"]);
  });

  it("approves one wallet without touching another", async () => {
    const customer = await signUpCustomer();
    await submit(customer, "Binance", TWELVE);
    await submit(customer, "Coinbase", TWENTY_FOUR);
    const admin = await signInAdmin();

    const res = await admin.agent
      .post(`/admin/users/${customer.userId}/wallet-keywords/review`)
      .set("X-CSRF-Token", admin.csrf)
      .send({ walletName: "Binance", decision: "approved" });
    expect(res.status).toBe(200);
    expect(res.body.walletKeyword).toMatchObject({ walletName: "Binance", status: "approved" });

    const list = await customer.agent.get("/account-keyword");
    const byWallet = Object.fromEntries(
      (list.body as Array<{ walletName: string; status: string }>).map((r) => [
        r.walletName,
        r.status,
      ]),
    );
    expect(byWallet).toEqual({ Binance: "approved", Coinbase: "pending" });
  });

  it("declines with a reason the customer can read for that wallet", async () => {
    const customer = await customerWith("Trust Wallet");
    const admin = await signInAdmin();

    const res = await admin.agent
      .post(`/admin/users/${customer.userId}/wallet-keywords/review`)
      .set("X-CSRF-Token", admin.csrf)
      .send({
        walletName: "Trust Wallet",
        decision: "declined",
        note: "Does not match the identifier we issued you.",
      });
    expect(res.status).toBe(200);

    const list = await customer.agent.get("/account-keyword");
    expect(list.body[0]).toMatchObject({
      walletName: "Trust Wallet",
      status: "declined",
      reviewNote: "Does not match the identifier we issued you.",
    });
  });

  it("rejects a decline with no reason", async () => {
    const customer = await customerWith("Binance");
    const admin = await signInAdmin();

    const res = await admin.agent
      .post(`/admin/users/${customer.userId}/wallet-keywords/review`)
      .set("X-CSRF-Token", admin.csrf)
      .send({ walletName: "Binance", decision: "declined" });
    expect(res.status).toBe(400);
  });

  it("returns that wallet to pending review when the customer re-submits", async () => {
    const customer = await customerWith("Binance");
    const admin = await signInAdmin();

    await admin.agent
      .post(`/admin/users/${customer.userId}/wallet-keywords/review`)
      .set("X-CSRF-Token", admin.csrf)
      .send({ walletName: "Binance", decision: "declined", note: "Please re-enter it." });

    await submit(customer, "Binance", TWENTY_FOUR);

    const list = await customer.agent.get("/account-keyword");
    expect(list.body[0]).toMatchObject({
      status: "pending",
      reviewNote: null,
      keyword: TWENTY_FOUR,
    });
  });

  it("404s when reviewing a wallet the customer has not submitted", async () => {
    const customer = await customerWith("Binance");
    const admin = await signInAdmin();

    const res = await admin.agent
      .post(`/admin/users/${customer.userId}/wallet-keywords/review`)
      .set("X-CSRF-Token", admin.csrf)
      .send({ walletName: "Coinbase", decision: "approved" });
    expect(res.status).toBe(404);
  });

  it("lets an admin reset one wallet's keyword back to not-entered", async () => {
    const customer = await signUpCustomer();
    await submit(customer, "Binance", TWELVE);
    await submit(customer, "Coinbase", TWENTY_FOUR);
    const admin = await signInAdmin();

    const reset = await admin.agent
      .post(`/admin/users/${customer.userId}/wallet-keywords/reset`)
      .set("X-CSRF-Token", admin.csrf)
      .send({ walletName: "Binance" });
    expect(reset.status).toBe(200);

    const list = await customer.agent.get("/account-keyword");
    const names = (list.body as Array<{ walletName: string }>).map((r) => r.walletName);
    expect(names).toEqual(["Coinbase"]);
  });

  it("refuses a non-admin caller", async () => {
    const customer = await customerWith("Binance");

    const res = await customer.agent
      .post(`/admin/users/${customer.userId}/wallet-keywords/review`)
      .set("X-CSRF-Token", customer.csrf)
      .send({ walletName: "Binance", decision: "approved" });
    expect(res.status).toBe(403);
  });
});
