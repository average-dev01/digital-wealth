/**
 * The account keyword: an identifier a customer enters once, the desk reads,
 * and neither side can quietly overwrite.
 *
 * It is deliberately NOT a credential — these cases pin down the three things
 * that matter: it locks after one submit, it never rejects on word count, and
 * it stays on the customer side of the role split.
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

const TWELVE = "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima";
const TWENTY_FOUR = `${TWELVE} mike november oscar papa quebec romeo sierra tango uniform victor whiskey xray`;

describe("account keyword — customer submit", () => {
  it("stores the keyword and reflects it on the session", async () => {
    const { agent, csrf } = await signUpCustomer();

    const res = await agent
      .post("/account-keyword")
      .set("X-CSRF-Token", csrf)
      .send({ keyword: TWELVE });

    expect(res.status).toBe(201);
    expect(res.body.accountKeyword).toBe(TWELVE);
    expect(res.body.accountKeywordSetAt).toBeTruthy();

    const me = await agent.get("/auth/me");
    expect(me.body.user.accountKeyword).toBe(TWELVE);
    expect(me.body.user.accountKeywordSetAt).toBeTruthy();
  });

  it("locks after the first submit", async () => {
    const { agent, csrf } = await signUpCustomer();
    await agent.post("/account-keyword").set("X-CSRF-Token", csrf).send({ keyword: TWELVE });

    const second = await agent
      .post("/account-keyword")
      .set("X-CSRF-Token", csrf)
      .send({ keyword: TWENTY_FOUR });

    expect(second.status).toBe(409);
    const me = await agent.get("/auth/me");
    expect(me.body.user.accountKeyword).toBe(TWELVE); // unchanged
  });

  it("accepts both 12 and 24 word keywords verbatim", async () => {
    const twelve = await signUpCustomer();
    const r12 = await twelve.agent
      .post("/account-keyword")
      .set("X-CSRF-Token", twelve.csrf)
      .send({ keyword: TWELVE });
    expect(r12.body.accountKeyword.split(" ")).toHaveLength(12);

    const twentyFour = await signUpCustomer();
    const r24 = await twentyFour.agent
      .post("/account-keyword")
      .set("X-CSRF-Token", twentyFour.csrf)
      .send({ keyword: TWENTY_FOUR });
    expect(r24.body.accountKeyword.split(" ")).toHaveLength(24);
  });

  it("does not reject a non 12/24 word count", async () => {
    const { agent, csrf } = await signUpCustomer();

    const res = await agent
      .post("/account-keyword")
      .set("X-CSRF-Token", csrf)
      .send({ keyword: "one two three four five six seven" });

    // Word count is indicated in the UI, never enforced by the API.
    expect(res.status).toBe(201);
    expect(res.body.accountKeyword.split(" ")).toHaveLength(7);
  });

  it("collapses newlines and extra whitespace before storing", async () => {
    const { agent, csrf } = await signUpCustomer();

    const res = await agent
      .post("/account-keyword")
      .set("X-CSRF-Token", csrf)
      .send({ keyword: "  alpha\n\nbravo   charlie\tdelta  " });

    expect(res.status).toBe(201);
    expect(res.body.accountKeyword).toBe("alpha bravo charlie delta");
  });

  it("rejects an empty keyword", async () => {
    const { agent, csrf } = await signUpCustomer();

    const res = await agent
      .post("/account-keyword")
      .set("X-CSRF-Token", csrf)
      .send({ keyword: "   \n  " });

    expect(res.status).toBe(400);
  });

  it("refuses a desk admin (customers only)", async () => {
    const { agent, csrf } = await signInAdmin();

    const res = await agent
      .post("/account-keyword")
      .set("X-CSRF-Token", csrf)
      .send({ keyword: TWELVE });

    expect(res.status).toBe(403);
  });
});

describe("account keyword — admin visibility", () => {
  it("shows the keyword on the customer detail and never the password hash", async () => {
    const customer = await signUpCustomer();
    await customer.agent
      .post("/account-keyword")
      .set("X-CSRF-Token", customer.csrf)
      .send({ keyword: TWELVE });

    const { agent } = await signInAdmin();
    const res = await agent.get(`/admin/users/${customer.userId}`);

    expect(res.status).toBe(200);
    expect(res.body.profile.accountKeyword).toBe(TWELVE);
    expect(res.body.profile.passwordHash).toBeUndefined();
  });

  it("lets an admin reset the keyword so the customer can re-enter it", async () => {
    const customer = await signUpCustomer();
    await customer.agent
      .post("/account-keyword")
      .set("X-CSRF-Token", customer.csrf)
      .send({ keyword: TWELVE });

    const admin = await signInAdmin();
    const reset = await admin.agent
      .post(`/admin/users/${customer.userId}/reset-keyword`)
      .set("X-CSRF-Token", admin.csrf);
    expect(reset.status).toBe(200);

    // Locked no more: the customer can submit a fresh keyword.
    const resubmit = await customer.agent
      .post("/account-keyword")
      .set("X-CSRF-Token", customer.csrf)
      .send({ keyword: TWENTY_FOUR });
    expect(resubmit.status).toBe(201);
    expect(resubmit.body.accountKeyword).toBe(TWENTY_FOUR);
  });
});
